import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { GoogleGenAI, Type } from "@google/genai";
import { head, put } from "@vercel/blob";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { getDesign } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 120;

// Admin: the "Noosho explains" reel. Two actions:
//   script — Noosho's lines for one design (before → new colours → products with
//            real prices → CTA). Prices are pasted in from the design, never
//            written by the model.
//   voice  — Gemini TTS, one call per line, stitched into one WAV so each line's
//            [start,end] is exact. Cached in Blob by the script's hash.

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY! });
const blobToken = process.env.newblob_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;

const TTS_MODEL = "gemini-2.5-flash-preview-tts";
const VOICES = ["Laomedeia", "Leda"] as const;
const RATE = 24000; // TTS output: 16-bit mono PCM at 24 kHz
const LEAD = 0.25; // silence before the first line
const GAP = 0.4; // breath between lines

function parseJsonish<T>(raw: unknown): T | null {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }
  return (raw as T) ?? null;
}

type Prod = { amazonProduct?: { title?: string; price?: string; imageUrl?: string } | null };

async function buildScript(designId: string) {
  const design = await getDesign(designId);
  if (!design) throw new Error("Design not found");
  const ra = parseJsonish<Record<string, unknown>>(design.room_analysis) ?? {};
  const ec = parseJsonish<Record<string, unknown>>(design.event_config) ?? {};
  const products = (parseJsonish<Prod[]>(design.products) ?? [])
    .map((p) => p.amazonProduct)
    .filter((p): p is NonNullable<Prod["amazonProduct"]> => !!p?.imageUrl && !!p?.price)
    .slice(0, 3);

  const context = [
    design.mode === "event"
      ? `Event decoration: ${ec.subTheme ?? ""} ${ec.eventLabel ?? "event"}`
      : `Room: ${ra.roomType ?? "room"}, current style ${ra.currentStyle ?? "unknown"}`,
    `Before-photo colours: ${(ra.colorPalette as string[] | undefined)?.join(", ") || "unknown"}`,
    `Existing furniture: ${(ra.existingFurniture as string[] | undefined)?.join(", ") || "unknown"}`,
    `New design: ${design.design_narrative || "a fresh redesign"}`,
    `Products: ${products.map((p, i) => `${i}. ${p.title}`).join(" | ")}`,
  ].join("\n");

  const res = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `You write lines for Noosho, a bubbly, warm Indian cartoon interior designer, for a 20-second Instagram reel.
${context}

Return:
- beforeLine: one short, kind, playful line about the room as it was (max 12 words), e.g. "This was the room — a bit plain, na?"
- afterLine: one short line revealing the new look and naming 2-3 main colours (max 16 words), starting with "And ta-da!"
- palette: the 3 main colours of the NEW design, each {name, hex}
- productNames: for each product in order, a short spoken name (2-4 words, e.g. "this rattan lamp")
Simple English with a light Indian flavour. No emojis, no prices.`,
          },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          beforeLine: { type: Type.STRING },
          afterLine: { type: Type.STRING },
          palette: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: { name: { type: Type.STRING }, hex: { type: Type.STRING } },
              required: ["name", "hex"],
            },
          },
          productNames: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["beforeLine", "afterLine", "palette", "productNames"],
      },
    },
  });
  const out = JSON.parse(res.text ?? "{}") as {
    beforeLine: string;
    afterLine: string;
    palette: { name: string; hex: string }[];
    productNames: string[];
  };

  const productLines = products.map((p, i) => {
    const name = (out.productNames[i] || "this piece").replace(/[.!]+$/, "");
    const cap = name.charAt(0).toUpperCase() + name.slice(1);
    return `${cap}, just ${p.price}!`;
  });
  return {
    lines: [
      "Hello frends! I'm Noosho!",
      out.beforeLine,
      out.afterLine,
      ...productLines,
      "Everything's ready to shop. Design yours at noosho.com!",
    ],
    products: products.map((p) => ({ title: p.title || "Featured product", price: p.price!, imageUrl: p.imageUrl! })),
    palette: (out.palette ?? []).filter((c) => /^#[0-9a-f]{6}$/i.test(c.hex)).slice(0, 3),
  };
}

async function ttsLine(text: string, voice: string): Promise<Buffer> {
  const res = await ai.models.generateContent({
    model: TTS_MODEL,
    contents: [
      {
        role: "user",
        parts: [{ text: `Say in a cheerful, bubbly, energetic Indian English accent: ${text}` }],
      },
    ],
    config: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
    },
  });
  const data = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData?.data;
  if (!data) throw new Error(`No audio for line: ${text}`);
  return trimSilence(Buffer.from(data, "base64"));
}

/** Drop leading/trailing near-silence so the gaps we add are the real gaps. */
function trimSilence(pcm: Buffer): Buffer {
  const n = pcm.length >> 1;
  const loud = (i: number) => Math.abs(pcm.readInt16LE(i * 2)) > 600;
  let s = 0;
  while (s < n && !loud(s)) s++;
  let e = n - 1;
  while (e > s && !loud(e)) e--;
  const pad = Math.round(RATE * 0.04);
  return pcm.subarray(Math.max(0, s - pad) * 2, Math.min(n, e + pad) * 2);
}

function wav(pcm: Buffer): Buffer {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVEfmt ", 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(RATE, 24);
  h.writeUInt32LE(RATE * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

async function buildVoice(designId: string, lines: string[], voice: string) {
  const hash = createHash("sha1").update(JSON.stringify({ lines, voice })).digest("hex").slice(0, 12);
  const key = `promo-vo/${designId}-${hash}.json`;
  try {
    const existing = await head(key, { token: blobToken });
    if (existing?.url) return { ...(await fetch(existing.url).then((r) => r.json())), cached: true };
  } catch {
    /* not cached yet */
  }

  const clips = await Promise.all(lines.map((l) => ttsLine(l, voice)));
  const parts: Buffer[] = [Buffer.alloc(Math.round(RATE * LEAD) * 2)];
  const segments: [number, number][] = [];
  let t = LEAD;
  for (const c of clips) {
    const d = c.length / 2 / RATE;
    segments.push([+t.toFixed(3), +(t + d).toFixed(3)]);
    parts.push(c, Buffer.alloc(Math.round(RATE * GAP) * 2));
    t += d + GAP;
  }
  const audio = await put(`promo-vo/${designId}-${hash}.wav`, wav(Buffer.concat(parts)), {
    access: "public",
    contentType: "audio/wav",
    addRandomSuffix: false,
    allowOverwrite: true,
    token: blobToken,
  });
  const meta = { url: audio.url, segments };
  await put(key, JSON.stringify(meta), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
    token: blobToken,
  });
  return { ...meta, cached: false };
}

export async function POST(request: Request) {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const body = await request.json();
    const designId = String(body.designId || "");
    if (!designId) return NextResponse.json({ error: "Missing designId" }, { status: 400 });

    if (body.action === "script") {
      return NextResponse.json(await buildScript(designId));
    }
    if (body.action === "voice") {
      const lines = (Array.isArray(body.lines) ? body.lines : [])
        .map((l: unknown) => String(l).trim())
        .filter(Boolean)
        .slice(0, 10);
      if (!lines.length) return NextResponse.json({ error: "No lines" }, { status: 400 });
      const voice = VOICES.includes(body.voice) ? body.voice : VOICES[0];
      return NextResponse.json(await buildVoice(designId, lines, voice));
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    console.error("noosho-explain failed:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
