import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { GoogleGenAI } from "@google/genai";
import { del, head, put } from "@vercel/blob";
import { spawn } from "child_process";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import ffmpegPath from "ffmpeg-static";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { getDesign } from "@/lib/db";
import { ensureHotspots } from "@/lib/hotspots";
import { designTotal } from "@/lib/price";
import type { ProductResult } from "@/lib/types";
import { mixSfx } from "@/lib/promo/explainSfx";

export const runtime = "nodejs";
export const maxDuration = 120;

// Admin: the "Noosho explains" reel ("blank canvas" script, picked 2026-09-27).
//   script — the fixed five lines for one design, with its space word, plus the
//            products/prices the video pins (prices come from the design only).
//   voice  — one Gemini TTS take, cut into lines at its pauses, tightened, sped
//            up 15%, with synthesised sound effects mixed in. Cached in Blob.
//   mux    — phones: adds that voice to a silent render as AAC.

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

async function buildScript(designId: string) {
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
  // Prefer products we can point at, then the priciest (the video shows 2–3).
  const amt = (p: { price?: string }) => Number((p.price || "").replace(/[^\d.]/g, "")) || 0;
  withSpot.sort((a, b) => (b.spot ? 1 : 0) - (a.spot ? 1 : 0) || amt(b) - amt(a));
  const products = withSpot.slice(0, 6);

  // The space she names: "living room", "hallway", or "birthday setup".
  const space =
    design.mode === "event"
      ? `${String(ec.eventLabel || "party").toLowerCase()} setup`
      : String(ra.roomType || "room").toLowerCase();

  // The total shows on screen (badge), not in her line — the long number made
  // the reel drag. "from" when some products have no price.
  const basket = designTotal(parseJsonish<ProductResult[]>(design.products) ?? []);
  const price = basket ? roundPrice(basket.formatted) : null;
  const lead = basket?.partial ? "from" : "for";
  return {
    lines: [
      `Hello frends! Look at this ${space}…`,
      "So plain — like a blank canvas, na?",
      "So I gave it some love… ta-da!",
      "And every piece is real — ready to shop!",
      "Let's design yours at noosho.com!",
    ],
    total: price ? `Buy everything ${lead} ${price}` : null,
    products: products.map((p) => ({
      title: p.title || "Featured product",
      price: roundPrice(p.price!),
      imageUrl: p.imageUrl!,
      x: p.spot?.x,
      y: p.spot?.y,
    })),
  };
}

/** The finalised Noosho direction (docs/NOOSHO_CHARACTER.md §2), with the
 *  promo-specific beats swapped for this script's. */
const DIRECTION =
  "Read this as Noosho, a tiny, super cute cartoon mascot, in a warm, natural " +
  "Indian English accent — like a sweet, bubbly little Indian girl cartoon " +
  "character. Very energetic and happy, a big smile in the voice, bouncy. Punch " +
  "the greeting, and a delighted burst on 'Ta-da!'. Leave a clear " +
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
function splitTake(pcm: Buffer, n: number, weights?: number[]): [number, number][] | null {
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
  // Pick each line break near where it should fall (by the lines' lengths),
  // favouring longer pauses — a dramatic pause inside a line ("frends!… Look")
  // can outlast a real gap between lines, so "the n-1 longest" misaligns.
  const total = weights?.reduce((a, b) => a + b, 0) || 0;
  const span = last - first;
  const cuts: { s: number; e: number }[] = [];
  let acc = 0, from = 0;
  for (let k = 0; k < n - 1; k++) {
    acc += weights?.[k] ?? 1;
    const want = first + span * (total ? acc / total : (k + 1) / n);
    let best = -1, bestScore = Infinity;
    for (let g = from; g < gaps.length - (n - 2 - k); g++) {
      const mid = (gaps[g].s + gaps[g].e) / 2;
      const score = Math.abs(mid - want) - 2.5 * (gaps[g].e - gaps[g].s);
      if (score < bestScore) { bestScore = score; best = g; }
    }
    if (best < 0) return null;
    cuts.push(gaps[best]);
    from = best + 1;
  }
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

/**
 * Rebuild the take with every between-line pause cut to one short beat — the
 * model leaves 0.5–1s between lines, which is most of what made the reel long.
 */
function tighten(
  pcm: Buffer,
  segs: [number, number][],
  holdAfter = -1,
  hold = 0
): { pcm: Buffer; segments: [number, number][] } {
  const PAD = 0.05, BEAT = 0.22, LEAD = 0.15;
  const parts: Buffer[] = [Buffer.alloc(Math.round(LEAD * RATE) * 2)];
  const out: [number, number][] = [];
  let t = LEAD;
  for (const [i, [s, e]] of segs.entries()) {
    const beat = BEAT + (i === holdAfter ? hold : 0);
    const a = Math.max(0, Math.round((s - PAD) * RATE)) * 2;
    const b = Math.min(pcm.length, Math.round((e + PAD) * RATE) * 2);
    const clip = pcm.subarray(a, b);
    const d = clip.length / 2 / RATE;
    out.push([+(t + PAD).toFixed(3), +(t + d - PAD).toFixed(3)]);
    parts.push(clip, Buffer.alloc(Math.round(beat * RATE) * 2));
    t += d + beat;
  }
  return { pcm: Buffer.concat(parts), segments: out };
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

/** Speed up without changing pitch (ffmpeg atempo). */
async function speedUp(pcm: Buffer, tempo: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      ffmpegPath as unknown as string,
      ["-f", "s16le", "-ar", String(RATE), "-ac", "1", "-i", "pipe:0", "-filter:a", `atempo=${tempo}`, "-f", "s16le", "-ar", String(RATE), "-ac", "1", "pipe:1"],
      { stdio: ["pipe", "pipe", "ignore"] }
    );
    const chunks: Buffer[] = [];
    proc.stdout.on("data", (c) => chunks.push(c));
    proc.on("error", reject);
    proc.on("close", (code) => (code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(`atempo exited ${code}`))));
    proc.stdin.end(pcm);
  });
}

const TEMPO = 1.15; // punchier read, accent intact

async function buildVoice(designId: string, lines: string[], voice: string, fx: { prices: number; total: boolean }) {
  const hash = createHash("sha1").update(JSON.stringify({ v: 6, lines, voice, fx })).digest("hex").slice(0, 12);
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
    segments = splitTake(pcm, lines.length, lines.map((l) => spoken(l).length));
  }
  if (!pcm || !segments) throw new Error("Couldn't find the line breaks in Noosho's take — try again.");
  // hold the real-products beat a moment so the prices can land
  ({ pcm, segments } = tighten(pcm, segments, 3, 0.2));
  pcm = await speedUp(pcm, TEMPO);
  segments = segments.map(([s, e]) => [+(s / TEMPO).toFixed(3), +(e / TEMPO).toFixed(3)] as [number, number]);
  pcm = mixSfx(pcm, RATE, segments, fx);
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

function ffmpeg(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const proc = spawn(ffmpegPath as unknown as string, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    proc.stderr.on("data", (d) => (err = (err + d).slice(-4000)));
    proc.on("error", reject);
    proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${err}`))));
  });
}

const BLOB_HOST = /^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\//;

/** Phones can't encode AAC in the browser, so they upload a silent render and
 *  we add the voice here: video copied as-is, audio encoded to AAC. */
async function mux(designId: string, videoUrl: string, audioUrl: string) {
  if (!BLOB_HOST.test(videoUrl) || !BLOB_HOST.test(audioUrl)) throw new Error("Bad media URL");
  const dir = await mkdtemp(path.join(tmpdir(), "noosho-mux-"));
  try {
    const [v, a] = await Promise.all(
      [videoUrl, audioUrl].map(async (u) => {
        const r = await fetch(u);
        if (!r.ok) throw new Error(`Download failed (${r.status})`);
        return Buffer.from(await r.arrayBuffer());
      })
    );
    const vin = path.join(dir, "in.mp4"), ain = path.join(dir, "voice.wav"), out = path.join(dir, "out.mp4");
    await Promise.all([writeFile(vin, v), writeFile(ain, a)]);
    await ffmpeg([
      "-y", "-i", vin, "-i", ain,
      "-map", "0:v:0", "-map", "1:a:0",
      "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-ar", "48000",
      "-movflags", "+faststart", out,
    ]);
    const blob = await put(`promo-out/${designId}-${Date.now()}.mp4`, await readFile(out), {
      access: "public",
      contentType: "video/mp4",
      addRandomSuffix: true,
      token: blobToken,
    });
    await del(videoUrl, { token: blobToken }).catch(() => {});
    return { url: blob.url };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
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
    if (body.action === "mux") {
      return NextResponse.json(await mux(designId, String(body.videoUrl || ""), String(body.audioUrl || "")));
    }
    if (body.action === "voice") {
      const lines = (Array.isArray(body.lines) ? body.lines : [])
        .map((l: unknown) => String(l).trim())
        .filter(Boolean)
        .slice(0, 10);
      if (!lines.length) return NextResponse.json({ error: "No lines" }, { status: 400 });
      const voice = VOICES.includes(body.voice) ? body.voice : VOICES[0];
      const fx = { prices: Math.max(0, Math.min(3, Number(body.prices) || 0)), total: !!body.total };
      return NextResponse.json(await buildVoice(designId, lines, voice, fx));
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    console.error("noosho-explain failed:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
