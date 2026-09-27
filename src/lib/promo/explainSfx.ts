/**
 * Sound effects for the "Noosho explains" reel, synthesised (no licensed
 * audio) and mixed into the 16-bit mono voice PCM. Every cue is timed from the
 * voice's line segments with the same formulas the canvas scenes use
 * (src/lib/promo/styles/explain.ts), so sounds land on their visuals:
 *   boing (she hops in) · whoosh (before photo) · whoosh + rising sparkle
 *   (ta-da wipe) · pop per price · chime (total badge) · whoosh, pop, ding
 *   (logo outro).
 */
import { PRICE_POP, TOTAL_POP } from "./explainPrices";

type Gen = (i: number) => number;

export function mixSfx(
  pcm: Buffer,
  rate: number,
  segs: [number, number][],
  opts: { prices: number; total: boolean }
): Buffer {
  const out = Buffer.from(pcm);
  const mix = (at: number, gen: Gen, dur: number) => {
    const s0 = Math.round(Math.max(0, at) * rate);
    for (let i = 0; i < dur * rate; i++) {
      const j = (s0 + i) * 2;
      if (j + 1 >= out.length) break;
      const v = out.readInt16LE(j) + gen(i) * 32767;
      out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v))), j);
    }
  };
  const tt = (i: number) => i / rate;

  let seed = 7;
  const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  const whoosh = (dur: number, amp = 0.16): Gen => {
    let lp = 0;
    return (i) => {
      const u = tt(i) / dur;
      lp += (0.02 + 0.25 * Math.sin(Math.PI * u)) * (noise() - lp);
      return amp * lp * Math.sin(Math.PI * Math.min(1, u)) ** 2 * 2.2;
    };
  };
  const pop: Gen = (i) => { const t = tt(i); return 0.22 * Math.sin(2 * Math.PI * (700 * t + 4000 * t * t)) * Math.exp(-t * 45); };
  const chime: Gen = (i) => {
    const t = tt(i);
    return 0.12 * (Math.sin(2 * Math.PI * 1318 * t) + Math.sin(2 * Math.PI * 1760 * t) + 0.5 * Math.sin(2 * Math.PI * 2637 * t)) * Math.exp(-t * 6);
  };
  const boing: Gen = (i) => {
    const t = tt(i);
    const f = 240 + 260 * t + 90 * Math.sin(2 * Math.PI * 11 * t) * Math.exp(-5 * t);
    return 0.2 * Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 7);
  };
  const sparkle: Gen = (i) => {
    const t = tt(i);
    let v = 0;
    [1568, 1976, 2349, 2637, 3136, 3951].forEach((f, k) => {
      const tk = t - k * 0.055;
      if (tk > 0) v += Math.sin(2 * Math.PI * f * tk) * Math.exp(-tk * 12);
    });
    return 0.075 * v;
  };
  const ding: Gen = (i) => {
    const t = tt(i);
    return 0.11 * (Math.sin(2 * Math.PI * 880 * t) + 0.6 * Math.sin(2 * Math.PI * 1760 * t) + 0.3 * Math.sin(2 * Math.PI * 2640 * t)) * Math.exp(-t * 4);
  };

  // scene starts, as in explain.ts: at(i) = line start − 0.25; the room comes in
  // midway through the greeting
  const at = (k: number) => Math.max(0, segs[k][0] - 0.25);
  const last = segs.length - 1;
  const roomIn = Math.min(at(1), segs[0][0] + (segs[0][1] - segs[0][0]) * 0.45);

  mix(0.05, boing, 0.5);
  mix(roomIn - 0.05, whoosh(0.5), 0.5);
  mix(at(2), whoosh(0.9, 0.13), 0.9);
  mix(Math.max(at(2) + 0.6, segs[2][1] - 0.45), sparkle, 0.7);
  if (last === 4) {
    for (let k = 0; k < opts.prices; k++) mix(at(3) + PRICE_POP.first + k * PRICE_POP.step, pop, 0.12);
    if (opts.total) mix(at(3) + TOTAL_POP + opts.prices * PRICE_POP.step, chime, 0.8);
  }
  mix(at(last), whoosh(0.6), 0.6);
  mix(at(last) + 0.5, pop, 0.12);
  mix(at(last) + 0.7, ding, 1.2);
  return out;
}
