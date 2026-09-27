import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { GoogleGenAI, Type } from "@google/genai";
import { head, put } from "@vercel/blob";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { getDesign } from "@/lib/db";
import { ensureHotspots } from "@/lib/hotspots";
import { designTotal } from "@/lib/price";
import type { ProductResult } from "@/lib/types";

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

/** "$129.56" → "$130", "₹4,499.00" → "₹4,499": whole numbers read cleanly aloud. */
function roundPrice(price: string): string {
  return price.replace(/([\d,]+)\.(\d+)/, (_, whole: string, frac: string) => {
    const n = Math.ceil(parseFloat(`${whole.replace(/,/g, "")}.${frac}`));
    return n.toLocaleString(/₹|Rs|INR/i.test(price) ? "en-IN" : "en-US");
  });
}

async function buildScript(designId: string, quick = false) {
  // Hotspots let the video pin each price onto the design itself.
  try {
    await ensureHotspots(designId);
  } catch {
    /* prices fall back to tags along the bottom */
  }
  const design = await getDesign(designId);
  if (!design) throw new Error("Design not found");
  const ra = parseJsonish<Record<string, unknown>>(design.room_analysis) ?? {};
  const ec = parseJsonish<Record<string, unknown>>(design.event_config) ?? {};
  const hot = new Map(
    (parseJsonish<{ productIndex: number; x: number; y: number }[]>(design.hotspots) ?? []).map((h) => [h.productIndex, h])
  );
  const withSpot = (parseJsonish<Prod[]>(design.products) ?? [])
    .map((p, i) => ({ ...p.amazonProduct, spot: hot.get(i) }))
    .filter((p) => !!p.imageUrl && !!p.price);
  // Prefer products we can point at on the design.
  withSpot.sort((a, b) => (b.spot ? 1 : 0) - (a.spot ? 1 : 0));
  const products = withSpot.slice(0, quick ? 6 : 3);

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
    return `${cap}, just ${roundPrice(p.price!)}!`;
  });
  const palette = (out.palette ?? []).filter((c) => /^#[0-9a-f]{6}$/i.test(c.hex)).slice(0, 3);
  const productOut = products.map((p) => ({
    title: p.title || "Featured product",
    price: roundPrice(p.price!),
    imageUrl: p.imageUrl!,
    x: p.spot?.x,
    y: p.spot?.y,
  }));

  if (quick) {
    // ~12s cut: Noosho speaks only the hook, the before, "ta-da" and the CTA;
    // the prices show on screen, silently, and add up to the whole-look total.
    const basket = designTotal(parseJsonish<ProductResult[]>(design.products) ?? []);
    return {
      lines: [
        design.mode === "event" ? "Guess what this whole setup cost?" : "Guess what this whole room cost?",
        out.beforeLine,
        "Ta-da!",
        "Design yours at noosho.com!",
      ],
      products: productOut,
      palette,
      total: basket ? { text: roundPrice(basket.formatted), partial: basket.partial } : null,
    };
  }

  return {
    lines: [
      "Hello frends! I'm Noosho!",
      out.beforeLine,
      out.afterLine,
      ...productLines,
      "Everything's ready to shop. Design yours at noosho.com!",
    ],
    products: productOut,
    palette,
  };
}

/** The finalised Noosho direction (docs/NOOSHO_CHARACTER.md §2), with the
 *  promo-specific beats swapped for this script's. */
const DIRECTION =
  "Read this as Noosho, a tiny, super cute cartoon mascot, in a warm, natural " +
  "Indian English accent — like a sweet, bubbly little Indian girl cartoon " +
  "character. Very energetic and happy, a big smile in the voice, bouncy. Punch " +
  "the greeting 'Hello frends!', and a delighted burst on 'Ta-da!'. Leave a clear " +
  "short pause between lines. Clear words, upbeat pace. Pronounce 'Noosho' as NOO-shoh:";

/** How a line is *spoken* — captions keep the written form. Currency is spelled
 *  out so a $ price is never read as rupees, and the URL as "dot com". */
function spoken(text: string): string {
  return text
    .replace(/\.com\b/gi, " dot com")
    .replace(/(?:US)?\$\s?([\d,]+)(?:\.(\d{1,2}))?/g, (_, d: string, c?: string) =>
      c && +c > 0 ? `${d} dollars ${c.padEnd(2, "0")}` : `${d} dollars`
    )
    .replace(/(?:₹|Rs\.?|INR)\s?([\d,]+)(?:\.\d+)?/gi, (_, d: string) => `${d} rupees`);
}

async function tts(text: string, voice: string): Promise<Buffer> {
  // The preview TTS model sometimes returns an empty (text-only) candidate; retry.
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await ai.models.generateContent({
      model: TTS_MODEL,
      contents: [{ role: "user", parts: [{ text: `${DIRECTION}\n\n${text}` }] }],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
      },
    });
    const data = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData?.data;
    if (data) return Buffer.from(data, "base64");
  }
  throw new Error("The voice model returned no audio — try again.");
}

/**
 * Cut one continuous take into `n` line segments at its n-1 longest pauses
 * (the same method used for the promo VOs). Null if the take doesn't have
 * enough clear pauses — the caller then re-records.
 */
function splitTake(pcm: Buffer, n: number): [number, number][] | null {
  const hop = Math.round(RATE * 0.01); // 10 ms frames
  const frames = Math.floor(pcm.length / 2 / hop);
  const loud: boolean[] = [];
  for (let f = 0; f < frames; f++) {
    let e = 0;
    for (let i = f * hop; i < (f + 1) * hop; i++) e += pcm.readInt16LE(i * 2) ** 2;
    loud.push(Math.sqrt(e / hop) > 500);
  }
  const first = loud.indexOf(true);
  const last = loud.lastIndexOf(true);
  if (first < 0) return null;
  const gaps: { s: number; e: number }[] = [];
  for (let f = first; f <= last; f++) {
    if (loud[f]) continue;
    const s = f;
    while (f <= last && !loud[f]) f++;
    if (f - s >= 12) gaps.push({ s, e: f }); // ≥120 ms
  }
  if (gaps.length < n - 1) return null;
  const cuts = gaps.sort((a, b) => b.e - b.s - (a.e - a.s)).slice(0, n - 1).sort((a, b) => a.s - b.s);
  const t = (f: number) => +((f * hop) / RATE).toFixed(3);
  const segs: [number, number][] = [];
  let start = first;
  for (const c of cuts) {
    segs.push([t(start), t(c.s)]);
    start = c.e;
  }
  segs.push([t(start), t(last + 1)]);
  return segs;
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

/**
 * @param gap optional silence inserted before line `gap.index` — the quick cut
 *   uses it for the silent price section, so one WAV still carries the timing.
 */
async function buildVoice(designId: string, lines: string[], voice: string, gap?: { index: number; seconds: number }) {
  const hash = createHash("sha1").update(JSON.stringify({ v: 2, lines, voice, gap })).digest("hex").slice(0, 12);
  const key = `promo-vo/${designId}-${hash}.json`;
  try {
    const existing = await head(key, { token: blobToken });
    if (existing?.url) return { ...(await fetch(existing.url).then((r) => r.json())), cached: true };
  } catch {
    /* not cached yet */
  }

  // One continuous take, like the finalised promo VO: the accent and energy
  // stay consistent across lines (separate calls drift between reads).
  const script = lines.map(spoken).join("\n\n");
  let pcm: Buffer | null = null;
  let segments: [number, number][] | null = null;
  for (let take = 0; take < 3 && !segments; take++) {
    pcm = await tts(script, voice);
    segments = splitTake(pcm, lines.length);
  }
  if (!pcm || !segments) throw new Error("Couldn't find the line breaks in Noosho's take — try again.");
  if (gap && gap.index > 0 && gap.index < segments.length && gap.seconds > 0) {
    // cut in the middle of the pause before that line
    const cutT = (segments[gap.index - 1][1] + segments[gap.index][0]) / 2;
    const at = Math.round(cutT * RATE) * 2;
    const secs = Math.min(15, gap.seconds);
    pcm = Buffer.concat([pcm.subarray(0, at), Buffer.alloc(Math.round(secs * RATE) * 2), pcm.subarray(at)]);
    segments = segments.map(([s, e], i) => (i >= gap.index ? [+(s + secs).toFixed(3), +(e + secs).toFixed(3)] : [s, e]));
  }
  const audio = await put(`promo-vo/${designId}-${hash}.wav`, wav(pcm), {
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
      return NextResponse.json(await buildScript(designId, body.format === "quick"));
    }
    if (body.action === "voice") {
      const lines = (Array.isArray(body.lines) ? body.lines : [])
        .map((l: unknown) => String(l).trim())
        .filter(Boolean)
        .slice(0, 10);
      if (!lines.length) return NextResponse.json({ error: "No lines" }, { status: 400 });
      const voice = VOICES.includes(body.voice) ? body.voice : VOICES[0];
      const gap =
        body.gap && Number.isInteger(body.gap.index) && Number.isFinite(body.gap.seconds)
          ? { index: body.gap.index as number, seconds: body.gap.seconds as number }
          : undefined;
      return NextResponse.json(await buildVoice(designId, lines, voice, gap));
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    console.error("noosho-explain failed:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
