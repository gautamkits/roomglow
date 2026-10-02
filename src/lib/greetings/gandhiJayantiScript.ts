/**
 * What Noosho says in the Gandhi Jayanti greeting, and how. Dependency-free so
 * the Node recorder (scripts/greeting-video.ts) can import it without pulling
 * in the canvas/React side.
 */

/** One line per scene beat, in Noosho's voice (docs/NOOSHO_CHARACTER.md). */
export const GANDHI_LINES = [
  "Hello frends! Namaste!",
  "Today is the second of October — Gandhi Jayanti!",
  "Bapu taught us truth, simplicity and kindness.",
  "And a simple home is a happy home!",
  "Happy Gandhi Jayanti, frends — from all of us at Noosho!",
];

/** The finalised Noosho direction (src/lib/promo/explainVoice.ts), with this
 *  script's beats in place of the reel's "Ta-da!". */
export const GANDHI_DIRECTION =
  "Read this as Noosho, a tiny, super cute cartoon mascot, in a warm, natural " +
  "Indian English accent — like a sweet, bubbly little Indian girl cartoon " +
  "character. Very energetic and happy, a big smile in the voice, bouncy. Punch " +
  "the greeting 'Hello frends! Namaste!', say the line about Bapu a little softer, " +
  "warm and respectful, then a bright, happy wish at the end. Leave a clear " +
  "short pause between lines. Clear words, upbeat pace. Pronounce 'Noosho' as NOO-shoh:";

/** Per-line [start, end] seconds in the final audio, and the reel length. */
export type GreetingTimeline = { segs: [number, number][]; duration: number };

/** Timeline from a recorded take's line segments; holds the outro after her last word. */
export function greetingTimeline(segs: [number, number][]): GreetingTimeline {
  return { segs, duration: +(segs[segs.length - 1][1] + 1.6).toFixed(3) };
}

/** Timing without a recording (layout checks): ~16 chars/s, short gaps. */
export function estimateTimeline(lines = GANDHI_LINES): GreetingTimeline {
  let t = 0.4;
  const segs = lines.map((l) => {
    const s = t;
    t += l.length / 16;
    const seg: [number, number] = [+s.toFixed(3), +t.toFixed(3)];
    t += 0.3;
    return seg;
  });
  return { segs, duration: +(t + 1.4).toFixed(3) };
}
