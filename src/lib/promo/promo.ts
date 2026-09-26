/**
 * The Noosho explainer: a 9:16 animated promo, rendered in the browser.
 *
 * Noosho is drawn from her real SVG (`Mascot`), rasterised once per pose, so
 * she is pixel-identical to the site; motion is applied as canvas transforms.
 * Every scene is timed to the voiceover: the VO was cut into one segment per
 * script line, and each scene starts just before its line. Change the VO and
 * the animation re-times itself.
 *
 * Built on the reel engine's brand helpers (src/lib/revealVideo.ts) rather than
 * a copy of them.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Mascot, { type MascotPose } from "@/components/Mascot";
import {
  loadImage,
  fitContain,
  drawCover,
  roundRect,
  drawLockup,
  drawBackdrop,
  clamp,
  lerp,
  easeOutCubic,
  easeInOutCubic,
  easeOutBack,
  REEL_W as W,
  REEL_H as H,
  INK,
  CLAY,
  CLAY_LT,
  SORA,
  UI,
  type Rect,
} from "@/lib/revealVideo";

// ── Script & voice timing ────────────────────────────────────────────────────

export const PROMO_LINES = [
  "Hi! I'm Noosho, your personal interior designer!",
  "Redoing a room?",
  "Planning a birthday…",
  "or an anniversary?",
  "Just send me one photo!",
  "I'll design it…",
  "and find real pieces you can actually buy!",
  "Ta-da!",
  "Tap anything to shop it.",
  "Let's design yours at noosho.com!",
] as const;

export type Seg = [number, number];

/** Speech segments of public/promo/noosho-vo.wav (Leda), one per line above. */
export const VO_SEGMENTS: Seg[] = [
  [0.18, 4.46], [4.88, 5.9], [6.12, 7.0], [7.3, 8.18], [8.7, 10.32],
  [10.68, 11.46], [11.68, 14.16], [14.54, 15.18], [15.66, 17.1], [17.54, 20.6],
];

export const VO_URL = "/promo/noosho-vo.wav";

/** Indian-accent take (Laomedeia) — the founder's chosen voice for Noosho. */
export const VO_INDIAN_URL = "/promo/noosho-vo-indian.wav";
export const VO_INDIAN_SEGMENTS: Seg[] = [
  [0.3, 3.66], [4.08, 5.02], [5.44, 6.4], [6.74, 7.68], [8.14, 9.5],
  [9.98, 10.82], [11.14, 13.34], [13.8, 14.54], [15.02, 16.28], [16.66, 19.04],
];

/** Calm storybook take of the same script (Leda), cut at its 9 longest pauses. */
export const VO_CALM_URL = "/promo/noosho-vo-calm.wav";
export const VO_CALM_SEGMENTS: Seg[] = [
  [0.16, 5.52], [6.4, 7.52], [8.16, 9.24], [9.8, 10.88], [11.78, 13.68],
  [14.46, 15.44], [15.98, 18.96], [19.74, 20.38], [20.88, 23.16], [24, 27.66],
];

export type Win = [number, number];
export type Timeline = {
  intro: Win; montage: Win; photo: Win; scan: Win; shop: Win; reveal: Win; pins: Win; outro: Win;
  lines: Seg[];
  duration: number;
};

export function buildTimeline(seg: Seg[] = VO_SEGMENTS): Timeline {
  const b = (i: number) => Math.max(0, seg[i][0] - 0.25); // scene starts a beat before its line
  const end = seg[9][1] + 1.3;
  return {
    intro: [0, b(1)],
    montage: [b(1), b(4)],
    photo: [b(4), b(5)],
    scan: [b(5), b(6)],
    shop: [b(6), b(7)],
    reveal: [b(7), b(8)],
    pins: [b(8), b(9)],
    outro: [b(9), end],
    lines: seg,
    duration: end,
  };
}

// ── Assets ───────────────────────────────────────────────────────────────────

export type PromoProduct = { img: HTMLImageElement; price: string; x?: number; y?: number };
export type PromoAssets = {
  noosho: Record<MascotPose, HTMLImageElement>;
  before: HTMLImageElement;
  after: HTMLImageElement;
  cards: { img: HTMLImageElement; label: string }[];
  products: PromoProduct[];
  /** Extra published designs for the montage style. */
  gallery: { before: HTMLImageElement; after: HTMLImageElement; label: string }[];
  /** Expression frames (blink × mouth × arm) — see loadExpressions. */
  expr?: Map<string, HTMLImageElement>;
  /** Voice loudness per video frame (30fps), 0–1, for lip-sync. */
  envelope?: Float32Array;
};

const POSES: MascotPose[] = ["idle", "peek", "carry", "idea", "celebrate", "wave", "sleep"];

async function nooshoSprites(): Promise<Record<MascotPose, HTMLImageElement>> {
  const entries = await Promise.all(
    POSES.map(async (pose) => {
      const svg = renderToStaticMarkup(createElement(Mascot, { pose, size: 520, still: true })).replace(
        "<svg",
        '<svg xmlns="http://www.w3.org/2000/svg"'
      );
      const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
      return [pose, await loadImage(url)] as const;
    })
  );
  return Object.fromEntries(entries) as Record<MascotPose, HTMLImageElement>;
}

type DesignJson = {
  products?: { amazonProduct?: { imageUrl?: string; price?: string } | null }[];
  hotspots?: { productIndex: number; x: number; y: number }[];
};

/**
 * Load everything the promo draws. All images are same-origin (the image route
 * with ?inline=1, the product proxy) so the canvas never taints.
 */
export async function loadPromoAssets(ids: {
  room: string;
  birthday: string;
  anniversary: string;
  gallery?: { id: string; label: string }[];
}): Promise<PromoAssets> {
  const img = (id: string, v: "before" | "after") => loadImage(`/api/image/${id}/${v}?inline=1`);
  const design: DesignJson = await fetch(`/api/design/${ids.room}`).then((r) => r.json());
  const hot = new Map((design.hotspots ?? []).map((h) => [h.productIndex, h]));

  const productSrc = (design.products ?? [])
    .map((p, i) => ({ url: p.amazonProduct?.imageUrl, price: p.amazonProduct?.price ?? "", i }))
    .filter((p) => !!p.url)
    .slice(0, 8);

  const [noosho, before, after, room, birthday, anniversary, products] = await Promise.all([
    nooshoSprites(),
    img(ids.room, "before"),
    img(ids.room, "after"),
    img(ids.room, "after"),
    img(ids.birthday, "after"),
    img(ids.anniversary, "after"),
    Promise.all(
      productSrc.map(async (p) => {
        try {
          const im = await loadImage(`/api/proxy-image?url=${encodeURIComponent(p.url!)}`);
          const h = hot.get(p.i);
          return { img: im, price: p.price, x: h?.x, y: h?.y } as PromoProduct;
        } catch {
          return null;
        }
      })
    ),
  ]);

  return {
    noosho,
    before,
    after,
    cards: [
      { img: room, label: "Rooms" },
      { img: birthday, label: "Birthdays" },
      { img: anniversary, label: "Anniversaries" },
    ],
    products: products.filter((p): p is PromoProduct => !!p),
    gallery: (
      await Promise.all(
        (ids.gallery ?? []).map(async (g) => {
          try {
            const [b, af] = await Promise.all([img(g.id, "before"), img(g.id, "after")]);
            return { before: b, after: af, label: g.label };
          } catch {
            return null;
          }
        })
      )
    ).filter((g): g is { before: HTMLImageElement; after: HTMLImageElement; label: string } => !!g),
  };
}


// ── Expressions: blinking, lip-sync, waving ──────────────────────────────────

type Mouth = "open" | "wide" | "o" | undefined;
const BLINKS = [0, 0.5, 1];
const MOUTHS: Mouth[] = [undefined, "open", "wide", "o"];
// Swing from upright to out to the side — further inward the arm covers her eye.
const ARMS = [-6, 6, 18, 30, 40];
const exprKey = (pose: MascotPose, blink: number, mouth: Mouth, arm: number) => `${pose}|${blink}|${mouth ?? "-"}|${arm}`;

/** Pre-render every expression frame, so the render loop stays synchronous. */
export async function loadExpressions(): Promise<Map<string, HTMLImageElement>> {
  const jobs: [string, Record<string, unknown>][] = [];
  for (const pose of POSES) {
    for (const blink of BLINKS) {
      for (const mouth of MOUTHS) {
        for (const arm of pose === "wave" ? ARMS : [0]) {
          jobs.push([exprKey(pose, blink, mouth, arm), { pose, size: 520, still: true, blink, mouth, armAngle: arm }]);
        }
      }
    }
  }
  const out = new Map<string, HTMLImageElement>();
  await Promise.all(
    jobs.map(async ([key, props]) => {
      const svg = renderToStaticMarkup(createElement(Mascot, props as Parameters<typeof Mascot>[0])).replace(
        "<svg",
        '<svg xmlns="http://www.w3.org/2000/svg"'
      );
      out.set(key, await loadImage(URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }))));
    })
  );
  return out;
}

/** Loudness of the voiceover per 30fps frame, normalised 0–1. */
export async function loadVoiceEnvelope(url: string): Promise<Float32Array> {
  const buf = await fetch(url).then((r) => r.arrayBuffer());
  const audio = await new AudioContext().decodeAudioData(buf);
  const data = audio.getChannelData(0);
  const per = Math.round(audio.sampleRate / 30);
  const env = new Float32Array(Math.ceil(data.length / per));
  let max = 0;
  for (let f = 0; f < env.length; f++) {
    let e = 0;
    const end = Math.min(data.length, (f + 1) * per);
    for (let i = f * per; i < end; i++) e += data[i] * data[i];
    env[f] = Math.sqrt(e / per);
    max = Math.max(max, env[f]);
  }
  for (let f = 0; f < env.length; f++) env[f] = max ? env[f] / max : 0;
  return env;
}

/** Global video time, set by the exporter each frame (blinks and lip-sync run on it). */
let FRAME_T = 0;
export function setFrameTime(t: number) {
  FRAME_T = t;
}

function pickExpression(
  a: PromoAssets,
  pose: MascotPose,
  o: { mouth?: Mouth | "smile"; talk?: boolean; seed?: number }
): HTMLImageElement {
  if (!a.expr) return a.noosho[pose];
  const t = FRAME_T;
  // blink roughly every 3s, a quick close-open over ~5 frames
  const ph = (t + (o.seed ?? 0) * 1.37) % 3.2;
  const blink = ph < 0.05 ? 0.5 : ph < 0.1 ? 1 : ph < 0.15 ? 0.5 : 0;
  // lip-sync from the voice's loudness, unless the scene forces an expression
  let mouth: Mouth = undefined;
  if (o.mouth === "o" || o.mouth === "open" || o.mouth === "wide") mouth = o.mouth;
  else if (o.talk !== false && a.envelope && pose !== "sleep") {
    const e = a.envelope[Math.min(a.envelope.length - 1, Math.floor(t * 30))] ?? 0;
    mouth = e > 0.5 ? "wide" : e > 0.16 ? "open" : undefined;
  }
  // a real wave: the arm swings through five angles
  const target = 17 + 23 * Math.sin(t * 9);
  const arm = pose === "wave" ? ARMS.reduce((best, v) => (Math.abs(v - target) < Math.abs(best - target) ? v : best), ARMS[0]) : 0;
  return a.expr.get(exprKey(pose, blink, mouth, arm)) ?? a.noosho[pose];
}

// ── Drawing helpers ──────────────────────────────────────────────────────────

/** The main photo card: the same rect across photo → scan → reveal → pins, so
 *  the room never jumps between scenes. Sized for a 3:4 photo. */
export const CARD: Rect = { x: 150, y: 230, w: 780, h: 1040 };
export const CAPTION_Y = 1500; // above Instagram's bottom UI, below the content

export function drawNoosho(
  ctx: CanvasRenderingContext2D,
  a: PromoAssets,
  pose: MascotPose,
  cx: number,
  footY: number,
  h: number,
  o: {
    t?: number; bob?: number; jump?: number; squash?: number; rot?: number; flip?: boolean; alpha?: number;
    /** Force a mouth shape (e.g. "o" for surprise); otherwise she lip-syncs. */
    mouth?: "open" | "wide" | "o" | "smile";
    /** Set false to stop lip-sync (e.g. a second Noosho on screen). */
    talk?: boolean;
    seed?: number;
  } = {}
) {
  const img = pickExpression(a, pose, o);
  const w = (h * 200) / 260;
  const bob = o.bob ? Math.sin(((o.t ?? 0) * 2 * Math.PI) / 1.5) * o.bob : 0;
  const sq = o.squash ?? 0;
  ctx.save();
  ctx.globalAlpha *= o.alpha ?? 1;
  ctx.translate(cx, footY - (o.jump ?? 0) + bob);
  ctx.rotate(o.rot ?? 0);
  ctx.scale((o.flip ? -1 : 1) * (1 + sq), 1 - sq);
  ctx.drawImage(img, -w / 2, -h, w, h);
  ctx.restore();
}

export function shadowCard(ctx: CanvasRenderingContext2D, r: Rect, radius: number) {
  ctx.save();
  ctx.shadowColor = "rgba(24,20,16,0.22)";
  ctx.shadowBlur = 50;
  ctx.shadowOffsetY = 18;
  ctx.fillStyle = "#fff";
  roundRect(ctx, r.x, r.y, r.w, r.h, radius);
  ctx.fill();
  ctx.restore();
}

export function photoCard(ctx: CanvasRenderingContext2D, img: HTMLImageElement, r: Rect, radius = 36) {
  shadowCard(ctx, r, radius);
  ctx.save();
  roundRect(ctx, r.x, r.y, r.w, r.h, radius);
  ctx.clip();
  drawCover(ctx, img, r.x, r.y, r.w, r.h);
  ctx.restore();
}

export function star(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, fill: string) {
  ctx.beginPath();
  ctx.moveTo(x, y - s);
  ctx.quadraticCurveTo(x, y, x + s, y);
  ctx.quadraticCurveTo(x, y, x, y + s);
  ctx.quadraticCurveTo(x, y, x - s, y);
  ctx.quadraticCurveTo(x, y, x, y - s);
  ctx.fillStyle = fill;
  ctx.fill();
}

export function pill(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, size: number, bg: string, fg: string) {
  ctx.save();
  ctx.font = `600 ${size}px ${UI}`;
  const w = ctx.measureText(text).width + size * 1.4;
  const h = size * 2;
  ctx.fillStyle = bg;
  roundRect(ctx, cx - w / 2, cy - h / 2, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, cx, cy + 1);
  ctx.restore();
}

/** Scene opacity with short crossfades so cuts never pop. */
export function sceneAlpha(t: number, [s, e]: Win, fade = 0.22): number {
  if (t < s || t > e + fade) return 0;
  const inA = s === 0 ? 1 : clamp((t - s) / fade);
  const outA = t > e ? 1 - clamp((t - e) / fade) : 1;
  return Math.min(inA, outA);
}

// ── Scenes (lt = time since the scene started) ──────────────────────────────

function sceneIntro(ctx: CanvasRenderingContext2D, a: PromoAssets, lt: number) {
  drawLockup(ctx, 330, 92, clamp((lt - 0.5) / 0.8), clamp((lt - 0.9) / 0.6));
  const rise = easeOutBack(clamp(lt / 0.6));
  const foot = lerp(H + 120, 1340, rise);
  drawNoosho(ctx, a, lt < 0.7 ? "idle" : "wave", W / 2, foot, 780, { t: lt, bob: lt > 0.7 ? 8 : 0 });
  for (let i = 0; i < 5; i++) {
    const p = clamp((lt - 0.8 - i * 0.12) / 0.4);
    if (p <= 0) continue;
    const ang = (i / 5) * Math.PI * 2 + 0.4;
    ctx.save();
    ctx.globalAlpha *= 1 - clamp((lt - 2.2 - i * 0.1) / 0.6);
    star(ctx, W / 2 + Math.cos(ang) * 400 * p, 900 + Math.sin(ang) * 330 * p, 16 + i * 3, i % 2 ? CLAY : INK);
    ctx.restore();
  }
}

function sceneMontage(ctx: CanvasRenderingContext2D, a: PromoAssets, lt: number, tl: Timeline) {
  const start = tl.montage[0];
  const slots = [
    { x: 380, y: 740, rot: -0.12 },
    { x: 700, y: 770, rot: 0.1 },
    { x: 540, y: 860, rot: -0.03 },
  ];
  a.cards.forEach((c, k) => {
    const at = tl.lines[1 + k][0] - start - 0.1;
    const p = easeOutBack(clamp((lt - at) / 0.45));
    if (p <= 0) return;
    const s = slots[k];
    const w = 520, h = 660;
    ctx.save();
    ctx.globalAlpha *= clamp((lt - at) / 0.2);
    ctx.translate(s.x, s.y - (1 - p) * 220);
    ctx.rotate(s.rot * p);
    ctx.scale(0.7 + 0.3 * p, 0.7 + 0.3 * p);
    // polaroid
    shadowCard(ctx, { x: -w / 2, y: -h / 2, w, h }, 22);
    ctx.save();
    roundRect(ctx, -w / 2 + 20, -h / 2 + 20, w - 40, h - 130, 14);
    ctx.clip();
    drawCover(ctx, c.img, -w / 2 + 20, -h / 2 + 20, w - 40, h - 130);
    ctx.restore();
    ctx.fillStyle = INK;
    ctx.font = `700 46px ${SORA}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(c.label, 0, h / 2 - 56);
    ctx.restore();
  });
  drawNoosho(ctx, a, "idea", 190, 1380, 400, { t: lt, bob: 7 });
}

function scenePhoto(ctx: CanvasRenderingContext2D, a: PromoAssets, lt: number, dur: number) {
  const flashAt = Math.min(0.75, dur * 0.45);
  const fly = easeInOutCubic(clamp((lt - flashAt - 0.1) / 0.5));
  // Noosho raises a phone
  const up = easeOutBack(clamp(lt / 0.4));
  drawNoosho(ctx, a, "idle", 400, 1360, 600, { t: lt, bob: 6, alpha: 1 - fly * 0.6 });
  const phone: Rect = { x: 560, y: lerp(1100, 700, up), w: 250, h: 460 };
  // the photo flies from the phone screen to the main card
  const screen: Rect = { x: phone.x + 18, y: phone.y + 40, w: phone.w - 36, h: phone.h - 80 };
  const r: Rect = {
    x: lerp(screen.x, CARD.x, fly),
    y: lerp(screen.y, CARD.y, fly),
    w: lerp(screen.w, CARD.w, fly),
    h: lerp(screen.h, CARD.h, fly),
  };
  if (fly < 1) {
    ctx.save();
    ctx.translate(phone.x + phone.w / 2, phone.y + phone.h / 2);
    ctx.rotate(-0.08 * (1 - fly));
    ctx.translate(-(phone.x + phone.w / 2), -(phone.y + phone.h / 2));
    ctx.globalAlpha *= 1 - fly;
    ctx.fillStyle = INK;
    roundRect(ctx, phone.x, phone.y, phone.w, phone.h, 40);
    ctx.fill();
    ctx.restore();
  }
  if (lt > flashAt - 0.05) photoCard(ctx, a.before, r, lerp(16, 36, fly));
  else {
    // live camera viewfinder: the room on screen, framing corners, a shutter
    ctx.save();
    roundRect(ctx, screen.x, screen.y, screen.w, screen.h, 16);
    ctx.clip();
    drawCover(ctx, a.before, screen.x, screen.y, screen.w, screen.h);
    ctx.restore();
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 4;
    const m = 18, L = 30;
    for (const [cx, cy, dx, dy] of [
      [screen.x + m, screen.y + m, 1, 1],
      [screen.x + screen.w - m, screen.y + m, -1, 1],
      [screen.x + m, screen.y + screen.h - m - 60, 1, -1],
      [screen.x + screen.w - m, screen.y + screen.h - m - 60, -1, -1],
    ]) {
      ctx.beginPath();
      ctx.moveTo(cx, cy + dy * L); ctx.lineTo(cx, cy); ctx.lineTo(cx + dx * L, cy);
      ctx.stroke();
    }
    const bx = screen.x + screen.w / 2, by = screen.y + screen.h - 38;
    const press = lt > flashAt - 0.15 ? 0.82 : 1;
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(bx, by, 22 * press, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(bx, by, 30, 0, Math.PI * 2); ctx.stroke();
  }
  // camera flash
  const flash = 1 - clamp((lt - flashAt) / 0.35);
  if (lt >= flashAt && flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${0.85 * flash})`;
    ctx.fillRect(0, 0, W, H);
  }
}

function sceneScan(ctx: CanvasRenderingContext2D, a: PromoAssets, lt: number) {
  photoCard(ctx, a.before, CARD);
  ctx.save();
  roundRect(ctx, CARD.x, CARD.y, CARD.w, CARD.h, 36);
  ctx.clip();
  ctx.fillStyle = "rgba(24,20,16,0.18)";
  ctx.fillRect(CARD.x, CARD.y, CARD.w, CARD.h);
  // faint grid
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 2;
  for (let gx = CARD.x; gx < CARD.x + CARD.w; gx += 78) {
    ctx.beginPath(); ctx.moveTo(gx, CARD.y); ctx.lineTo(gx, CARD.y + CARD.h); ctx.stroke();
  }
  for (let gy = CARD.y; gy < CARD.y + CARD.h; gy += 78) {
    ctx.beginPath(); ctx.moveTo(CARD.x, gy); ctx.lineTo(CARD.x + CARD.w, gy); ctx.stroke();
  }
  // sweeping scan line
  const sy = CARD.y + ((lt % 1.1) / 1.1) * CARD.h;
  const g = ctx.createLinearGradient(0, sy - 140, 0, sy);
  g.addColorStop(0, "rgba(206,101,51,0)");
  g.addColorStop(1, "rgba(206,101,51,0.55)");
  ctx.fillStyle = g;
  ctx.fillRect(CARD.x, sy - 140, CARD.w, 140);
  ctx.fillStyle = CLAY_LT;
  ctx.fillRect(CARD.x, sy - 3, CARD.w, 6);
  ctx.restore();
  ["Empty room", "Great daylight", "Room for a sofa"].forEach((f, i) => {
    const p = easeOutBack(clamp((lt - 0.15 - i * 0.18) / 0.35));
    if (p <= 0) return;
    ctx.save();
    ctx.globalAlpha *= clamp(p);
    const cy = CARD.y + CARD.h - 70 - i * 84;
    ctx.translate(CARD.x + 40, cy);
    ctx.scale(p, p);
    ctx.font = `600 34px ${UI}`;
    const w = ctx.measureText(`✓  ${f}`).width + 44;
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    roundRect(ctx, 0, -32, w, 64, 32);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.textBaseline = "middle";
    ctx.fillText(`✓  ${f}`, 22, 1);
    ctx.restore();
  });
  drawNoosho(ctx, a, "peek", 880, 1400, 470, { t: lt, bob: 6 });
}

function sceneShop(ctx: CanvasRenderingContext2D, a: PromoAssets, lt: number, dur: number) {
  ctx.fillStyle = INK;
  ctx.font = `700 64px ${SORA}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.globalAlpha *= 1;
  ctx.fillText("Noosho’s picks ✨", W / 2, 330);
  const cols = 4, cell = 212, gap = 26;
  const gridW = cols * cell + (cols - 1) * gap;
  const x0 = (W - gridW) / 2, y0 = 420;
  const checkFrom = dur * 0.55;
  a.products.slice(0, 8).forEach((p, i) => {
    const at = 0.1 + i * 0.13;
    const k = easeOutBack(clamp((lt - at) / 0.45));
    if (k <= 0) return;
    const cx = x0 + (i % cols) * (cell + gap) + cell / 2;
    const cy = y0 + Math.floor(i / cols) * (cell + gap + 30) + cell / 2;
    ctx.save();
    ctx.globalAlpha *= clamp((lt - at) / 0.15);
    ctx.translate(cx, cy - (1 - k) * 160);
    ctx.rotate((i % 2 ? 0.07 : -0.08) * k);
    ctx.scale(0.6 + 0.4 * k, 0.6 + 0.4 * k);
    shadowCard(ctx, { x: -cell / 2, y: -cell / 2, w: cell, h: cell }, 26);
    const fit = fitContain(p.img, -cell / 2 + 16, -cell / 2 + 16, cell - 32, cell - 32);
    ctx.drawImage(p.img, fit.x, fit.y, fit.w, fit.h);
    const c = easeOutBack(clamp((lt - checkFrom - i * 0.08) / 0.3));
    if (c > 0) {
      ctx.lineWidth = 7;
      ctx.strokeStyle = CLAY;
      roundRect(ctx, -cell / 2, -cell / 2, cell, cell, 26);
      ctx.stroke();
      ctx.save();
      ctx.translate(cell / 2 - 14, -cell / 2 + 14);
      ctx.scale(c, c);
      ctx.fillStyle = CLAY;
      ctx.beginPath(); ctx.arc(0, 0, 26, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 6; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.beginPath(); ctx.moveTo(-11, 1); ctx.lineTo(-3, 9); ctx.lineTo(12, -8); ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  });
  // Noosho dashes across with a parcel
  const x = lerp(-160, W + 160, clamp(lt / Math.max(dur, 0.1)));
  drawNoosho(ctx, a, "carry", x, 1330, 360, { rot: Math.sin(lt * 18) * 0.07, jump: Math.abs(Math.sin(lt * 18)) * 14 });
}

function sceneReveal(ctx: CanvasRenderingContext2D, a: PromoAssets, lt: number) {
  const wipe = easeInOutCubic(clamp((lt - 0.05) / 0.55));
  photoCard(ctx, a.before, CARD);
  ctx.save();
  roundRect(ctx, CARD.x, CARD.y, CARD.w, CARD.h, 36);
  ctx.clip();
  ctx.beginPath();
  ctx.rect(CARD.x, CARD.y, CARD.w * wipe, CARD.h);
  ctx.clip();
  drawCover(ctx, a.after, CARD.x, CARD.y, CARD.w, CARD.h);
  ctx.restore();
  if (wipe > 0 && wipe < 1) {
    ctx.fillStyle = "#fff";
    ctx.fillRect(CARD.x + CARD.w * wipe - 4, CARD.y, 8, CARD.h);
  }
  // sparkle burst once revealed
  for (let i = 0; i < 10; i++) {
    const p = easeOutCubic(clamp((lt - 0.55 - i * 0.03) / 0.7));
    if (p <= 0) continue;
    const ang = (i / 10) * Math.PI * 2;
    ctx.save();
    ctx.globalAlpha *= 1 - p * 0.9;
    star(ctx, W / 2 + Math.cos(ang) * (380 + 200 * p), 750 + Math.sin(ang) * (500 + 200 * p), 18 + (i % 3) * 6, i % 2 ? CLAY : "#F2A7A0");
    ctx.restore();
  }
  const j = Math.abs(Math.sin(lt * 6.5));
  drawNoosho(ctx, a, "celebrate", 190, 1420, 420, { jump: j * 70, squash: (1 - j) * 0.06 });
}

function scenePins(ctx: CanvasRenderingContext2D, a: PromoAssets, lt: number) {
  photoCard(ctx, a.after, CARD);
  const pins = a.products.filter((p) => p.x != null && p.y != null);
  // Label three pins that are spread out — the first three are often all on
  // the sofa, and their tags pile on top of each other.
  const tagged = new Set<number>();
  if (pins.length) {
    tagged.add(0);
    while (tagged.size < Math.min(3, pins.length)) {
      let best = -1, bestD = -1;
      pins.forEach((p, i) => {
        if (tagged.has(i) || !p.price) return;
        const d = Math.min(...[...tagged].map((j) => Math.hypot(p.x! - pins[j].x!, p.y! - pins[j].y!)));
        if (d > bestD) { bestD = d; best = i; }
      });
      if (best < 0) break;
      tagged.add(best);
    }
  }
  const tagOrder = [...tagged];
  pins.forEach((p, i) => {
    const k = easeOutBack(clamp((lt - 0.1 - i * 0.1) / 0.35));
    if (k <= 0) return;
    const px = CARD.x + (p.x! / 100) * CARD.w, py = CARD.y + (p.y! / 100) * CARD.h;
    ctx.save();
    ctx.translate(px, py);
    ctx.scale(k, k);
    const pulse = 0.5 + 0.5 * Math.sin((lt - i * 0.1) * 5);
    ctx.globalAlpha *= 0.5 * (1 - pulse);
    ctx.strokeStyle = CLAY; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(0, 0, 30 + pulse * 22, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.translate(px, py);
    ctx.scale(k, k);
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(0, 0, 26, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = CLAY; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.arc(0, 0, 26, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    // price tags on the spread-out three
    const ti = tagOrder.indexOf(i);
    if (ti >= 0 && p.price) {
      const tk = easeOutBack(clamp((lt - 0.55 - ti * 0.2) / 0.35));
      if (tk > 0) {
        ctx.save();
        ctx.globalAlpha *= clamp(tk);
        ctx.translate(px, py - 64);
        ctx.scale(tk, tk);
        pill(ctx, p.price, 0, 0, 30, INK, "#fff");
        ctx.restore();
      }
    }
  });
  // a tap on the first pin
  const tapAt = 1.0;
  if (pins[0] && lt > tapAt) {
    const px = CARD.x + (pins[0].x! / 100) * CARD.w, py = CARD.y + (pins[0].y! / 100) * CARD.h;
    const r = clamp((lt - tapAt) / 0.6);
    ctx.save();
    ctx.globalAlpha *= 1 - r;
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(px, py, 30 + r * 90, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  drawNoosho(ctx, a, "wave", 900, 1420, 400, { t: lt, bob: 6 });
}

function sceneOutro(ctx: CanvasRenderingContext2D, a: PromoAssets, lt: number) {
  drawLockup(ctx, 420, 120, clamp(lt / 0.7), clamp((lt - 0.3) / 0.6));
  const p = easeOutBack(clamp((lt - 0.5) / 0.4));
  if (p > 0) {
    ctx.save();
    ctx.globalAlpha *= clamp(p);
    ctx.translate(W / 2, 600);
    ctx.scale(p, p);
    pill(ctx, "noosho.com", 0, 0, 44, CLAY, "#fff");
    ctx.restore();
  }
  // ends centred and waving — close to the first frames, so a Reel loops cleanly
  const rise = easeOutBack(clamp(lt / 0.5));
  drawNoosho(ctx, a, "wave", W / 2, lerp(H + 120, 1340, rise), 700, { t: lt, bob: 8 });
}

// ── Captions ─────────────────────────────────────────────────────────────────

export function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width > max && cur) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

const ACCENT = /^(noosho|room\??|birthday…?|anniversary\??|ta-da!|noosho\.com!?)$/i;

export function drawCaption(ctx: CanvasRenderingContext2D, t: number, tl: Timeline, y = CAPTION_Y, size = 60) {
  const i = tl.lines.findIndex(([s, e]) => t >= s - 0.05 && t <= e + 0.3);
  if (i < 0) return;
  const [s, e] = tl.lines[i];
  const p = easeOutBack(clamp((t - s + 0.05) / 0.25));
  const out = 1 - clamp((t - e - 0.1) / 0.2);
  ctx.save();
  ctx.font = `700 ${size}px ${SORA}`;
  const lines = wrap(ctx, PROMO_LINES[i], 880);
  const lh = Math.round(size * 1.23);
  const boxW = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 90;
  const boxH = lines.length * lh + 50;
  ctx.globalAlpha *= clamp(p) * out;
  ctx.translate(W / 2, y);
  ctx.scale(0.85 + 0.15 * p, 0.85 + 0.15 * p);
  ctx.shadowColor = "rgba(24,20,16,0.18)";
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = "rgba(255,255,255,0.97)";
  roundRect(ctx, -boxW / 2, -boxH / 2, boxW, boxH, 36);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.textBaseline = "middle";
  lines.forEach((line, li) => {
    const y = -boxH / 2 + 25 + lh / 2 + li * lh;
    const words = line.split(" ");
    const total = ctx.measureText(line).width;
    let x = -total / 2;
    ctx.textAlign = "left";
    for (const w of words) {
      ctx.fillStyle = ACCENT.test(w) ? CLAY : INK;
      ctx.fillText(w, x, y);
      x += ctx.measureText(w + " ").width;
    }
  });
  ctx.restore();
}

// ── Frame ────────────────────────────────────────────────────────────────────

export function renderPromoFrame(
  ctx: CanvasRenderingContext2D,
  t: number,
  a: PromoAssets,
  tl: Timeline,
  opts: { captions?: boolean } = {}
) {
  drawBackdrop(ctx, t);
  const scenes: [Win, (lt: number, dur: number) => void][] = [
    [tl.intro, (lt) => sceneIntro(ctx, a, lt)],
    [tl.montage, (lt) => sceneMontage(ctx, a, lt, tl)],
    [tl.photo, (lt, d) => scenePhoto(ctx, a, lt, d)],
    [tl.scan, (lt) => sceneScan(ctx, a, lt)],
    [tl.shop, (lt, d) => sceneShop(ctx, a, lt, d)],
    [tl.reveal, (lt) => sceneReveal(ctx, a, lt)],
    [tl.pins, (lt) => scenePins(ctx, a, lt)],
    [tl.outro, (lt) => sceneOutro(ctx, a, lt)],
  ];
  for (const [win, draw] of scenes) {
    const al = sceneAlpha(t, win);
    if (al <= 0) continue;
    ctx.save();
    ctx.globalAlpha = al;
    draw(t - win[0], win[1] - win[0]);
    ctx.restore();
  }
  if (opts.captions !== false) drawCaption(ctx, t, tl);
}

// ── Export ───────────────────────────────────────────────────────────────────

const FPS = 30;
const AUDIO_RATE = 48000; // AAC encoders reject the TTS model's native 24 kHz

/** Decode the VO and resample it to 48 kHz mono for the AAC encoder. */
async function loadVoice(url: string, duration: number): Promise<Float32Array> {
  const buf = await fetch(url).then((r) => r.arrayBuffer());
  const decoded = await new AudioContext().decodeAudioData(buf);
  const off = new OfflineAudioContext(1, Math.ceil(duration * AUDIO_RATE), AUDIO_RATE);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start(0);
  return (await off.startRendering()).getChannelData(0);
}

export type PromoRender = (ctx: CanvasRenderingContext2D, t: number, a: PromoAssets, tl: Timeline) => void;

export async function generatePromoVideo(
  assets: PromoAssets,
  tl: Timeline,
  opts: {
    voice?: boolean;
    voiceUrl?: string;
    captions?: boolean;
    /** Style renderer; defaults to the original explainer. */
    render?: PromoRender;
    onProgress?: (f: number) => void;
  } = {}
): Promise<Blob> {
  const render: PromoRender =
    opts.render ?? ((ctx, t, a, tl2) => renderPromoFrame(ctx, t, a, tl2, { captions: opts.captions }));
  const { Muxer, ArrayBufferTarget } = await import("mp4-muxer");
  const withVoice = opts.voice !== false;

  let audioCodec: "aac" | "opus" | null = null;
  let audioConfig: AudioEncoderConfig | null = null;
  if (withVoice) {
    for (const [mux, codec] of [["aac", "mp4a.40.2"], ["opus", "opus"]] as const) {
      const cfg = { codec, sampleRate: AUDIO_RATE, numberOfChannels: 1, bitrate: 128_000 };
      if ((await AudioEncoder.isConfigSupported(cfg)).supported) {
        audioCodec = mux;
        audioConfig = cfg;
        break;
      }
    }
    if (!audioConfig) throw new Error("This browser can't encode audio — use Chrome or Edge.");
  }

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: "avc", width: W, height: H },
    ...(audioCodec ? { audio: { codec: audioCodec, numberOfChannels: 1, sampleRate: AUDIO_RATE } } : {}),
    fastStart: "in-memory",
  });

  const venc = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { throw e; },
  });
  const { pickCodec } = await import("@/lib/revealVideo");
  venc.configure({ codec: await pickCodec(), width: W, height: H, bitrate: 8_000_000, framerate: FPS });

  // Voice first: it's small and lets the muxer interleave cleanly.
  if (audioConfig) {
    const pcm = await loadVoice(opts.voiceUrl ?? VO_URL, tl.duration);
    const aenc = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: (e) => { throw e; },
    });
    aenc.configure(audioConfig);
    const block = 1024;
    for (let i = 0; i < pcm.length; i += block) {
      const data = pcm.subarray(i, Math.min(i + block, pcm.length));
      const ad = new AudioData({
        format: "f32-planar",
        sampleRate: AUDIO_RATE,
        numberOfFrames: data.length,
        numberOfChannels: 1,
        timestamp: Math.round((i / AUDIO_RATE) * 1e6),
        data: new Float32Array(data),
      });
      aenc.encode(ad);
      ad.close();
    }
    await aenc.flush();
    aenc.close();
  }

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { alpha: false })!;
  const total = Math.round(tl.duration * FPS);
  const frameDur = 1e6 / FPS;
  for (let i = 0; i < total; i++) {
    setFrameTime(i / FPS);
    render(ctx, i / FPS, assets, tl);
    const frame = new VideoFrame(canvas, { timestamp: Math.round(i * frameDur), duration: Math.round(frameDur) });
    venc.encode(frame, { keyFrame: i % (FPS * 2) === 0 });
    frame.close();
    while (venc.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 2));
    if (i % 15 === 0) opts.onProgress?.(i / total);
  }
  await venc.flush();
  venc.close();
  muxer.finalize();
  opts.onProgress?.(1);
  return new Blob([(muxer.target as InstanceType<typeof ArrayBufferTarget>).buffer], { type: "video/mp4" });
}
