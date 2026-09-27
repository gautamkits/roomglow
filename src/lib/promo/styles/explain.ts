/**
 * Style: "Noosho explains" — one design, talked through by Noosho on a
 * per-design voiceover (see /api/admin/noosho-explain). Line order is fixed by
 * the script builder:
 *   0 hello · 1 the room before · 2 ta-da, the new look + colours ·
 *   3..3+n products with prices · last: shop / noosho.com
 * Every scene starts on its line's segment, so any script length re-times.
 *
 * Layout is built for Reels: the design fills the frame (blurred copy of it
 * behind), Noosho is a big on-camera host standing in front of the card's
 * bottom-left corner, and her line comes out of her as a speech bubble. The
 * video opens on the finished design (payoff first), and everything stays
 * clear of Instagram's right-hand buttons and bottom caption area.
 */
import type { MascotPose } from "@/components/Mascot";
import {
  drawCover,
  roundRect,
  fitContain,
  clamp,
  lerp,
  easeOutBack,
  easeOutCubic,
  easeInOutCubic,
  REEL_W as W,
  REEL_H as H,
  INK,
  CLAY,
  type Rect,
} from "@/lib/revealVideo";
import { drawNoosho, pill, star, wrap, type PromoAssets, type PromoRender, type Timeline, type Seg } from "../promo";

/** x/y: the product's hotspot on the design, in % of the image. */
export type ExplainProduct = { img: HTMLImageElement; title: string; price: string; x?: number; y?: number };
export type ExplainExtras = {
  products: ExplainProduct[];
  palette: { name: string; hex: string }[];
};

/** Timeline from the voice route's per-line segments. */
export function explainTimeline(segments: Seg[], captions: string[]): Timeline {
  const z: [number, number] = [0, 0];
  return {
    intro: z, montage: z, photo: z, scan: z, shop: z, reveal: z, pins: z, outro: z,
    lines: segments,
    captions,
    duration: segments[segments.length - 1][1] + 1.0,
  };
}

export const SORA = "Sora, system-ui, sans-serif";

// ── Layout (1080×1920) ──────────────────────────────────────────────────────
export const CARD: Rect = { x: 48, y: 150, w: 984, h: 1230 };
// Noosho stands in front of whichever bottom corner of the card is calmer.
export const HOST = { left: 225, right: 845, foot: 1600, h: 450 };
export type Side = "left" | "right";
const BUBBLE_BOTTOM = 1610;
export const RADIUS = 44;

let bgCache: { src: HTMLImageElement; canvas: HTMLCanvasElement } | null = null;

/** Blurred, slightly darkened copy of the design — the frame's backdrop. Built once. */
export function backdrop(ctx: CanvasRenderingContext2D, img: HTMLImageElement) {
  if (bgCache?.src !== img) {
    const c = document.createElement("canvas");
    c.width = W / 4;
    c.height = H / 4;
    const b = c.getContext("2d")!;
    b.filter = "blur(10px)";
    drawCover(b, img, -20, -20, c.width + 40, c.height + 40);
    b.filter = "none";
    b.fillStyle = "rgba(24,20,16,0.35)";
    b.fillRect(0, 0, c.width, c.height);
    bgCache = { src: img, canvas: c };
  }
  ctx.drawImage(bgCache.canvas, 0, 0, W, H);
}

export function cardFrame(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 20;
  ctx.fillStyle = "#fff";
  roundRect(ctx, CARD.x - 8, CARD.y - 8, CARD.w + 16, CARD.h + 16, RADIUS + 8);
  ctx.fill();
  ctx.restore();
}

/** Draw `img` into the card, optionally pushed in toward (fx, fy). */
export function cardImage(ctx: CanvasRenderingContext2D, img: HTMLImageElement, zoom = 1, fx = CARD.x + CARD.w / 2, fy = CARD.y + CARD.h / 2) {
  ctx.save();
  roundRect(ctx, CARD.x, CARD.y, CARD.w, CARD.h, RADIUS);
  ctx.clip();
  ctx.translate(fx, fy);
  ctx.scale(zoom, zoom);
  ctx.translate(-fx, -fy);
  drawCover(ctx, img, CARD.x, CARD.y, CARD.w, CARD.h);
  ctx.restore();
}

/** Where the cover-fitted image lands in the card (so hotspot %s map to pixels). */
export function coverRect(img: HTMLImageElement): Rect {
  const s = Math.max(CARD.w / img.width, CARD.h / img.height);
  const w = img.width * s, h = img.height * s;
  return { x: CARD.x + (CARD.w - w) / 2, y: CARD.y + (CARD.h - h) / 2, w, h };
}

export function tag(ctx: CanvasRenderingContext2D, text: string, bg: string, k = 1) {
  if (k <= 0) return;
  ctx.save();
  ctx.font = `800 40px ${SORA}`;
  const w = ctx.measureText(text).width + 56;
  const x = CARD.x + 32, y = CARD.y + 32;
  ctx.translate(x, y + 36);
  ctx.scale(easeOutBack(clamp(k)), easeOutBack(clamp(k)));
  ctx.fillStyle = bg;
  roundRect(ctx, 0, -36, w, 72, 36);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 28, 2);
  ctx.restore();
}

// ── Noosho, the host ────────────────────────────────────────────────────────

/** A hop with squash-and-stretch at the start of every line — she reacts to her own words. */
function hostHop(t: number, L: number[]): { jump: number; squash: number } {
  let since = 99;
  for (const s of L) if (t >= s - 0.1) since = t - (s - 0.1);
  if (since > 0.5) return { jump: 0, squash: 0 };
  const p = since / 0.5;
  const jump = Math.sin(p * Math.PI) * 55;
  const squash = p < 0.12 ? 0.08 * (1 - p / 0.12) : p > 0.88 ? 0.06 * ((p - 0.88) / 0.12) : -0.03;
  return { jump, squash };
}

export function host(ctx: CanvasRenderingContext2D, a: PromoAssets, pose: MascotPose, t: number, L: number[], o: { h?: number; x?: number; foot?: number; extraJump?: number; mouth?: "o"; flip?: boolean } = {}) {
  const { jump, squash } = hostHop(t, L);
  // soft ground shadow so she reads as standing in front of the card
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  const sx = o.x ?? HOST.left, sy = (o.foot ?? HOST.foot) - 6;
  const ss = 1 - (jump + (o.extraJump ?? 0)) / 260;
  ctx.ellipse(sx, sy, 120 * ss, 22 * ss, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  drawNoosho(ctx, a, pose, sx, o.foot ?? HOST.foot, o.h ?? HOST.h, {
    t, bob: 6, jump: jump + (o.extraJump ?? 0), squash, mouth: o.mouth, flip: o.flip,
  });
}

// ── Speech bubble (the caption) ─────────────────────────────────────────────

const HOT = /^(ta-da!?|noosho\.com!?|noosho!?|frends!?|[$₹][\d,.]+!?)$/i;

/** Busyness of the photo's bottom corners → the side with more free space. */
const sideCache = new WeakMap<HTMLImageElement, Side>();
export function calmerSide(img: HTMLImageElement): Side {
  const hit = sideCache.get(img);
  if (hit) return hit;
  const w = 64, h = 80; // card aspect
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  drawCover(g, img, 0, 0, w, h);
  let side: Side = "left";
  try {
    const d = g.getImageData(0, 0, w, h).data;
    const lum = (x: number, y: number) => {
      const i = (y * w + x) * 4;
      return 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
    };
    // the area she covers: bottom ~30% of the card, outer ~40% on each side
    const score = (x0: number, x1: number) => {
      let e = 0;
      for (let y = 56; y < h - 1; y++)
        for (let x = x0; x < x1 - 1; x++) e += Math.abs(lum(x + 1, y) - lum(x, y)) + Math.abs(lum(x, y + 1) - lum(x, y));
      return e;
    };
    side = score(0, 26) <= score(38, 64) ? "left" : "right";
  } catch {
    /* tainted or unsupported: keep left */
  }
  sideCache.set(img, side);
  return side;
}

export function hostX(side: Side) {
  return side === "left" ? HOST.left : HOST.right;
}

export function speech(ctx: CanvasRenderingContext2D, t: number, tl: Timeline, side: Side = "left", hx = hostX(side)) {
  const mouth = { x: hx + (side === "left" ? 130 : -130), y: HOST.foot - HOST.h * 0.58 };
  const BUBBLE = side === "left" ? { x: hx + 185, right: 1000 } : { x: 60, right: hx - 185 };
  const i = tl.lines.findIndex(([s, e]) => t >= s - 0.1 && t <= e + 0.35);
  if (i < 0) return;
  const [s, e] = tl.lines[i];
  const text = tl.captions?.[i] ?? "";
  const pin = easeOutBack(clamp((t - s + 0.1) / 0.3));
  const out = 1 - clamp((t - e - 0.15) / 0.2);
  if (pin <= 0 || out <= 0) return;

  ctx.save();
  const size = text.length > 70 ? 50 : 58;
  ctx.font = `800 ${size}px ${SORA}`;
  const maxW = BUBBLE.right - BUBBLE.x - 64;
  const lines = wrap(ctx, text, maxW);
  const lh = Math.round(size * 1.18);
  const bw = Math.min(BUBBLE.right - BUBBLE.x, Math.max(...lines.map((l) => ctx.measureText(l).width)) + 64);
  const bh = lines.length * lh + 48;
  const bx = side === "left" ? BUBBLE.x : BUBBLE.right - bw, by = BUBBLE_BOTTOM - bh;

  // grow out of Noosho's mouth
  ctx.globalAlpha *= out;
  ctx.translate(mouth.x, mouth.y);
  ctx.scale(pin, pin);
  ctx.translate(-mouth.x, -mouth.y);

  ctx.shadowColor = "rgba(0,0,0,0.3)";
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = "#fff";
  roundRect(ctx, bx, by, bw, bh, 40);
  ctx.fill();
  // tail toward her mouth
  const ex = side === "left" ? bx + 30 : bx + bw - 30;
  ctx.beginPath();
  ctx.moveTo(ex, by + bh * 0.35);
  ctx.lineTo(mouth.x, mouth.y);
  ctx.lineTo(ex, by + bh * 0.35 + 70);
  ctx.closePath();
  ctx.fill();
  ctx.shadowColor = "transparent";

  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  lines.forEach((line, li) => {
    const y = by + 24 + lh / 2 + li * lh;
    let x = bx + 32;
    for (const w of line.split(" ")) {
      ctx.fillStyle = HOT.test(w) ? CLAY : INK;
      ctx.fillText(w, x, y);
      x += ctx.measureText(w + " ").width;
    }
  });
  ctx.restore();
}

// ── Product callouts ────────────────────────────────────────────────────────

export function pinDot(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, k: number) {
  if (k <= 0) return;
  const s = easeOutBack(clamp(k));
  const ring = (t * 1.2) % 1;
  ctx.save();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 6;
  ctx.globalAlpha *= (1 - ring) * clamp(k);
  ctx.beginPath();
  ctx.arc(x, y, 26 + ring * 46, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 14;
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(x, y, 26 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.fillStyle = CLAY;
  ctx.beginPath();
  ctx.arc(x, y, 14 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Price tag: thumbnail + big price + short name, stemmed to the pin. Stays in
 *  the card's upper/right area so it never lands behind Noosho. */
function priceTag(ctx: CanvasRenderingContext2D, p: ExplainProduct, px: number, py: number, k: number) {
  const s = easeOutBack(clamp(k));
  if (s <= 0) return;
  const w = 500, h = 150;
  const above = py - 70 - h > CARD.y + 120;
  const tx = clamp(px - w / 2, CARD.x + 24, CARD.x + CARD.w - 24 - w);
  const ty = above ? py - 70 - h : Math.min(py + 70, CARD.y + CARD.h - 420 - h);
  ctx.save();
  ctx.globalAlpha *= clamp(k * 1.5);
  ctx.translate(px, py);
  ctx.scale(s, s);
  ctx.translate(-px, -py);
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(clamp(px, tx + 40, tx + w - 40), above ? ty + h : ty);
  ctx.stroke();
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = "#fff";
  roundRect(ctx, tx, ty, w, h, 30);
  ctx.fill();
  ctx.shadowColor = "transparent";
  const th = fitContain(p.img, tx + 16, ty + 16, h - 32, h - 32);
  ctx.drawImage(p.img, th.x, th.y, th.w, th.h);
  ctx.textAlign = "left";
  ctx.fillStyle = CLAY;
  ctx.font = `800 60px ${SORA}`;
  ctx.fillText(p.price, tx + h + 4, ty + 78);
  ctx.fillStyle = INK;
  ctx.font = `600 26px ${SORA}`;
  const title = p.title.length > 26 ? p.title.slice(0, 25).trimEnd() + "…" : p.title;
  ctx.fillText(title, tx + h + 4, ty + 118);
  ctx.restore();
}

// ── Frame ───────────────────────────────────────────────────────────────────

export function makeExplainRender(x: ExplainExtras): PromoRender {
  return (ctx: CanvasRenderingContext2D, t: number, a: PromoAssets, tl: Timeline) => {
    const L = tl.lines.map(([s]) => s);
    const at = (i: number) => Math.max(0, L[i] - 0.15);
    const n = x.products.length;
    const last = L.length - 1;
    backdrop(ctx, a.after);

    // Where Noosho stands in each scene (scene i = line i): the calmer corner
    // of what's on screen; in product scenes, away from that product.
    const cr0 = coverRect(a.after);
    const sides: Side[] = L.map((_, i) => {
      if (i === 1) return calmerSide(a.before);
      if (i >= 3 && i < 3 + n) {
        const p = x.products[i - 3];
        if (p.x != null) return cr0.x + (p.x / 100) * cr0.w < CARD.x + CARD.w / 2 ? "right" : "left";
      }
      return calmerSide(a.after);
    });
    let scene = 0;
    for (let i = 0; i < L.length; i++) if (t >= at(i)) scene = i;
    const side = sides[scene];
    const slide = easeInOutCubic(clamp((t - at(scene)) / 0.35));
    const hx = lerp(hostX(sides[Math.max(0, scene - 1)]), hostX(side), scene === 0 ? 1 : slide);
    const flip = side === "right";

    if (t < at(1)) {
      // HOOK: open on the finished design; Noosho bursts in, big, waving.
      const zoom = 1.12 - 0.12 * easeOutCubic(clamp(t / 1.8));
      cardFrame(ctx);
      cardImage(ctx, a.after, zoom);
      const p = easeOutBack(clamp((t - 0.05) / 0.4));
      host(ctx, a, "wave", t, [], { h: 520 * p, x: hx, flip });
      for (let i = 0; i < 8; i++) {
        const sp = clamp((t - 0.3 - i * 0.07) / 0.7);
        if (sp <= 0 || sp >= 1) continue;
        const ang = (i / 8) * Math.PI * 2;
        ctx.save();
        ctx.globalAlpha = Math.sin(sp * Math.PI);
        star(ctx, hx + Math.cos(ang) * 300 * sp, 1330 + Math.sin(ang) * 240 * sp, 24, i % 2 ? CLAY : "#ffe1c4");
        ctx.restore();
      }
      speech(ctx, t, tl, side, hx);
      return;
    }

    if (t < at(2)) {
      // BEFORE: flip to how it looked; Noosho is unimpressed.
      const lt = t - at(1);
      const turn = easeInOutCubic(clamp(lt / 0.35));
      cardFrame(ctx);
      ctx.save();
      ctx.translate(W / 2, 0);
      ctx.scale(Math.abs(1 - 2 * turn) || 0.001, 1);
      ctx.translate(-W / 2, 0);
      cardImage(ctx, turn < 0.5 ? a.after : a.before);
      ctx.restore();
      if (turn >= 1) {
        // desaturate a touch — it's the "meh" version
        ctx.save();
        roundRect(ctx, CARD.x, CARD.y, CARD.w, CARD.h, RADIUS);
        ctx.clip();
        ctx.fillStyle = "rgba(60,60,60,0.12)";
        ctx.fillRect(CARD.x, CARD.y, CARD.w, CARD.h);
        ctx.restore();
      }
      tag(ctx, "BEFORE", "rgba(24,20,16,0.8)", (lt - 0.35) / 0.25);
      host(ctx, a, "idle", t, L, { x: hx, flip });
      speech(ctx, t, tl, side, hx);
      return;
    }

    if (t < at(3)) {
      // TA-DA: wipe to the new look; colours stack in, top-left.
      const lt = t - at(2);
      const wipe = easeInOutCubic(clamp(lt / 0.6));
      cardFrame(ctx);
      cardImage(ctx, a.before);
      ctx.save();
      roundRect(ctx, CARD.x, CARD.y, CARD.w * wipe, CARD.h, RADIUS);
      ctx.clip();
      cardImage(ctx, a.after);
      ctx.restore();
      if (wipe > 0 && wipe < 1) {
        const sx = CARD.x + CARD.w * wipe;
        ctx.fillStyle = "#fff";
        ctx.fillRect(sx - 5, CARD.y, 10, CARD.h);
        star(ctx, sx, CARD.y + CARD.h * 0.3, 34, "#fff");
        star(ctx, sx, CARD.y + CARD.h * 0.7, 24, "#ffe1c4");
      }
      tag(ctx, "AFTER", CLAY, (lt - 0.6) / 0.25);
      const dur = Math.max(1.1, at(3) - at(2));
      x.palette.forEach((c, i) => {
        const k = easeOutBack(clamp((lt - 0.7 - (i * (dur - 1.1)) / Math.max(1, x.palette.length)) / 0.3));
        if (k <= 0) return;
        ctx.save();
        ctx.font = `700 40px ${SORA}`;
        const name = c.name.length > 16 ? c.name.slice(0, 15) + "…" : c.name;
        const w = ctx.measureText(name).width + 130;
        const cx = CARD.x + 32, cy = CARD.y + 140 + i * 108;
        ctx.translate(cx, cy + 36);
        ctx.scale(k, k);
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        roundRect(ctx, 0, -36, w, 72, 36);
        ctx.fill();
        ctx.fillStyle = c.hex;
        ctx.beginPath();
        ctx.arc(38, 0, 24, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.12)";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = INK;
        ctx.textBaseline = "middle";
        ctx.fillText(name, 76, 2);
        ctx.restore();
      });
      const cheer = lt > 0.5 && lt < 1.7;
      host(ctx, a, cheer ? "celebrate" : "idea", t, L, {
        x: hx,
        flip,
        extraJump: cheer ? Math.abs(Math.sin((lt - 0.5) * 7)) * 40 : 0,
        mouth: lt > 0.15 && lt < 0.5 ? "o" : undefined,
      });
      speech(ctx, t, tl, side, hx);
      return;
    }

    if (n > 0 && t < at(last)) {
      // SHOP: the design stays the hero — camera eases to each product, its
      // price pins on; earlier prices stay as small tags.
      let idx = 0;
      while (idx < n - 1 && t >= at(4 + idx)) idx++;
      const lt = t - at(3 + idx);
      const cr = coverRect(a.after);
      const spot = (p: ExplainProduct) =>
        p.x != null && p.y != null
          ? { x: cr.x + (p.x / 100) * cr.w, y: cr.y + (p.y / 100) * cr.h, real: true }
          : { x: CARD.x + CARD.w * 0.62, y: CARD.y + CARD.h * 0.45, real: false };
      // Camera: screen = s·z + o. Each product glides to the open upper-right
      // of the card (away from Noosho), clamped so the photo always fills it.
      type Cam = { z: number; ox: number; oy: number };
      const Z = 1.3;
      const camFor = (s: { x: number; y: number; real: boolean }): Cam => {
        if (!s.real) return { z: 1, ox: 0, oy: 0 };
        const away = s.x < CARD.x + CARD.w / 2 ? 0.38 : 0.62;
        const tx = CARD.x + CARD.w * away, ty = CARD.y + CARD.h * 0.4;
        const ox = clamp(tx - s.x * Z, CARD.x + CARD.w - (cr.x + cr.w) * Z, CARD.x - cr.x * Z);
        const oy = clamp(ty - s.y * Z, CARD.y + CARD.h - (cr.y + cr.h) * Z, CARD.y - cr.y * Z);
        return { z: Z, ox, oy };
      };
      const cur = spot(x.products[idx]);
      const from = idx > 0 ? camFor(spot(x.products[idx - 1])) : { z: 1, ox: 0, oy: 0 };
      const to = camFor(cur);
      const m = easeInOutCubic(clamp(lt / 0.5));
      const cam: Cam = { z: lerp(from.z, to.z, m), ox: lerp(from.ox, to.ox, m), oy: lerp(from.oy, to.oy, m) };
      cardFrame(ctx);
      ctx.save();
      roundRect(ctx, CARD.x, CARD.y, CARD.w, CARD.h, RADIUS);
      ctx.clip();
      ctx.translate(cam.ox, cam.oy);
      ctx.scale(cam.z, cam.z);
      drawCover(ctx, a.after, CARD.x, CARD.y, CARD.w, CARD.h);
      ctx.restore();
      const onScreen = (s: { x: number; y: number }) => ({
        x: clamp(s.x * cam.z + cam.ox, CARD.x + 40, CARD.x + CARD.w - 40),
        y: clamp(s.y * cam.z + cam.oy, CARD.y + 40, CARD.y + CARD.h - 40),
      });
      ctx.save();
      roundRect(ctx, CARD.x, CARD.y, CARD.w, CARD.h, RADIUS);
      ctx.clip();
      for (let d = 0; d < idx; d++) {
        const s = spot(x.products[d]);
        if (!s.real) continue;
        const o = onScreen(s);
        pill(ctx, x.products[d].price, o.x, o.y, 30, "rgba(255,255,255,0.95)", CLAY);
      }
      const c = onScreen(cur);
      if (cur.real) pinDot(ctx, c.x, c.y, t, (lt - 0.15) / 0.25);
      priceTag(ctx, x.products[idx], c.x, c.y, (lt - 0.25) / 0.3);
      ctx.restore();
      tag(ctx, "SHOP THE LOOK", CLAY);
      host(ctx, a, "idea", t, L, { x: hx, flip });
      speech(ctx, t, tl, side, hx);
      return;
    }

    // OUTRO: the design, a big noosho.com, Noosho celebrating.
    const ot = t - at(last);
    cardFrame(ctx);
    cardImage(ctx, a.after);
    ctx.save();
    roundRect(ctx, CARD.x, CARD.y, CARD.w, CARD.h, RADIUS);
    ctx.clip();
    const g = ctx.createLinearGradient(0, CARD.y, 0, CARD.y + CARD.h * 0.5);
    g.addColorStop(0, "rgba(24,20,16,0.55)");
    g.addColorStop(1, "rgba(24,20,16,0)");
    ctx.fillStyle = g;
    ctx.fillRect(CARD.x, CARD.y, CARD.w, CARD.h);
    ctx.restore();
    const p = easeOutBack(clamp((ot - 0.1) / 0.4));
    if (p > 0) {
      ctx.save();
      ctx.translate(W / 2, CARD.y + 190);
      ctx.scale(p, p);
      ctx.fillStyle = "#fff";
      ctx.font = `800 56px ${SORA}`;
      ctx.textAlign = "center";
      ctx.fillText("Design yours from 1 photo", 0, -30);
      pill(ctx, "noosho.com", 0, 70, 50, CLAY, "#fff");
      ctx.restore();
    }
    host(ctx, a, "celebrate", t, L, { x: hx, flip, extraJump: Math.abs(Math.sin(ot * 4)) * 30 });
    speech(ctx, t, tl, side, hx);
  };
}
