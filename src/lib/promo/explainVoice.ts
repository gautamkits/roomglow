/**
 * The "Noosho explains" voice: one Gemini TTS take in the finalised Noosho
 * voice, cut into its lines at the pauses, tightened, sped up 15%, with the
 * synthesised sound effects mixed in. Server-only (ffmpeg). Shared by the admin
 * route and local preview renders so both produce the same audio.
 */
import { spawn } from "child_process";
import type { GoogleGenAI } from "@google/genai";
import ffmpegPath from "ffmpeg-static";
import { mixSfx } from "./explainSfx";

export const RATE = 24000; // TTS output: 16-bit mono PCM at 24 kHz
const TTS_MODEL = "gemini-2.5-flash-preview-tts";

/** The finalised Noosho direction (docs/NOOSHO_CHARACTER.md §2), with the
 *  promo-specific beats swapped for this script's. */
export const DIRECTION =
  "Read this as Noosho, a tiny, super cute cartoon mascot, in a warm, natural " +
  "Indian English accent — like a sweet, bubbly little Indian girl cartoon " +
  "character. Very energetic and happy, a big smile in the voice, bouncy. Punch " +
  "the greeting, and a delighted burst on 'Ta-da!'. Leave a clear " +
  "short pause between lines. Clear words, upbeat pace. Pronounce 'Noosho' as NOO-shoh:";

/** How a line is *spoken* — captions keep the written form. Currency is spelled
 *  out so a $ price is never read as rupees, and the URL as "dot com". */
export function spoken(text: string): string {
  return text
    .replace(/\.com\b/gi, " dot com")
    .replace(/(?:US)?\$\s?([\d,]+)(?:\.(\d{1,2}))?/g, (_, d: string, c?: string) =>
      c && +c > 0 ? `${d} dollars ${c.padEnd(2, "0")}` : `${d} dollars`
    )
    .replace(/(?:₹|Rs\.?|INR)\s?([\d,]+)(?:\.\d+)?/gi, (_, d: string) => `${d} rupees`);
}

export async function tts(ai: GoogleGenAI, text: string, voice: string): Promise<Buffer> {
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
export function splitTake(pcm: Buffer, n: number, weights?: number[]): [number, number][] | null {
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
export function tighten(
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

export function wav(pcm: Buffer): Buffer {
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
export async function speedUp(pcm: Buffer, tempo: number): Promise<Buffer> {
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

export const TEMPO = 1.15; // punchier read, accent intact

/** Record, cut, tighten, speed up and add SFX — everything but storage. */
export async function recordVoice(
  ai: GoogleGenAI,
  lines: string[],
  voice: string,
  fx: { prices: number; total: boolean }
): Promise<{ pcm: Buffer; segments: [number, number][] }> {
  // One continuous take, like the finalised promo VO: the accent and energy
  // stay consistent across lines (separate calls drift between reads).
  const script = lines.map(spoken).join("\n\n");
  let pcm: Buffer | null = null;
  let segments: [number, number][] | null = null;
  for (let take = 0; take < 3 && !segments; take++) {
    pcm = await tts(ai, script, voice);
    segments = splitTake(pcm, lines.length, lines.map((l) => spoken(l).length));
  }
  if (!pcm || !segments) throw new Error("Couldn't find the line breaks in Noosho's take — try again.");
  // hold the real-products beat a moment so the prices can land
  ({ pcm, segments } = tighten(pcm, segments, 3, 0.2));
  pcm = await speedUp(pcm, TEMPO);
  segments = segments.map(([s, e]) => [+(s / TEMPO).toFixed(3), +(e / TEMPO).toFixed(3)] as [number, number]);
  return { pcm: mixSfx(pcm, RATE, segments, fx), segments };
}
