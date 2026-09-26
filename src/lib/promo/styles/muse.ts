/**
 * Style: product film after the founder's reference (a clean, calm AI-agent
 * launch film). Near-white canvas with a soft warm glow, small precise type,
 * a tiny Noosho avatar with a status chip moving over real noosho UI
 * fragments, and a repeating refrain — "Noosho that ___ for you". Opens and
 * closes on a grid of real product cut-outs. Silent: made for music.
 */
import {
  drawCover,
  fitContain,
  roundRect,
  drawLockup,
  clamp,
  lerp,
  easeOutCubic,
  easeOutBack,
  easeInOutCubic,
  REEL_W as W,
  REEL_H as H,
  INK,
  CLAY,
  SORA,
  UI,
  type Rect,
} from "@/lib/revealVideo";
import { star, type PromoAssets, type Timeline } from "../promo";
import type { MascotPose } from "@/components/Mascot";

export const MUSE_DURATION = 27.5;

/** The film runs on its own clock; a Timeline shell satisfies the exporter. */
export function buildMuseTimeline(): Timeline {
  const z: [number, number] = [0, 0];
  return { intro: z, montage: z, photo: z, scan: z, shop: z, reveal: z, pins: z, outro: z, lines: [], duration: MUSE_DURATION };
}

const beats = {
  grid: [0, 3.0],
  title1: [2.2, 5.0],
  title2: [4.6, 7.2],
  prompt: [7.0, 10.0],
  shopping: [9.8, 13.4],
  refrain1: [13.2, 15.6],
  reveal: [15.4, 18.4],
  refrain2: [18.2, 20.6],
  refrain3: [20.4, 22.8],
  gridEnd: [22.6, 25.4],
  logo: [25.2, 27.5],
} as const;

function win(t: number, [s, e]: readonly [number, number], fade = 0.45) {
  if (t < s || t > e) return 0;
  return Math.min(clamp((t - s) / fade), clamp((e - t) / fade));
}

function canvas(ctx: CanvasRenderingContext2D, t: number) {
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, W, H);
  // the reference's soft glow, warmed to noosho clay
  const g = ctx.createRadialGradient(W * 0.55, H * 1.05 + Math.sin(t * 0.4) * 40, 0, W * 0.55, H * 1.05, H * 0.75);
  g.addColorStop(0, "rgba(232,155,107,0.35)");
  g.addColorStop(0.5, "rgba(250,236,224,0.25)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

/** Tiny Noosho in a white tile with a status chip under it, like the reference's avatar. */
function avatar(ctx: CanvasRenderingContext2D, a: PromoAssets, x: number, y: number, pose: MascotPose, status: string, alpha: number) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.shadowColor = "rgba(24,20,16,0.14)";
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = "#fff";
  roundRect(ctx, x - 62, y - 62, 124, 124, 38);
  ctx.fill();
  ctx.shadowColor = "transparent";
  const img = a.noosho[pose];
  ctx.drawImage(img, x - 42, y - 52, 84, 84 * (260 / 200) * 0.8);
  ctx.font = `500 24px ${UI}`;
  const w = ctx.measureText(status).width + 64;
  ctx.fillStyle = "rgba(255,255,255,0.96)";
  ctx.strokeStyle = "#ece7e1";
  ctx.lineWidth = 2;
  roundRect(ctx, x - w / 2, y + 74, w, 46, 23);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = CLAY;
  ctx.beginPath(); ctx.arc(x - w / 2 + 24, y + 97, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = INK;
  ctx.textBaseline = "middle";
  ctx.fillText(status, x - w / 2 + 40, y + 98);
  ctx.restore();
}

/** A line of type with a small image sitting between two words. */
function iconLine(ctx: CanvasRenderingContext2D, left: string, icon: HTMLImageElement | null, right: string, y: number, size: number, p: number, color = INK) {
  ctx.save();
  ctx.globalAlpha *= clamp(p);
  ctx.font = `500 ${size}px ${SORA}`;
  ctx.textBaseline = "middle";
  const iw = icon ? size * 0.9 : 0, gap = icon ? size * 0.35 : size * 0.28;
  const lw = ctx.measureText(left).width, rw = ctx.measureText(right).width;
  const total = lw + (icon ? gap + iw + gap : gap) + rw;
  let x = W / 2 - total / 2;
  const dy = (1 - easeOutCubic(p)) * 30;
  ctx.fillStyle = color;
  ctx.fillText(left, x, y + dy);
  x += lw + gap;
  if (icon) {
    const f = fitContain(icon, x, y - iw / 2 + dy, iw, iw);
    ctx.drawImage(icon, f.x, f.y, f.w, f.h);
    x += iw + gap;
  }
  ctx.fillText(right, x, y + dy);
  ctx.restore();
}

function refrain(ctx: CanvasRenderingContext2D, t: number, w: readonly [number, number], icon: HTMLImageElement | null, middle: string) {
  const a = win(t, w);
  if (a <= 0) return;
  const lt = t - w[0];
  ctx.save();
  ctx.globalAlpha = a;
  iconLine(ctx, "Noosho that", null, "", H / 2 - 150, 84, clamp(lt / 0.5));
  iconLine(ctx, "", icon, middle, H / 2, 50, clamp((lt - 0.25) / 0.5), "#3f3a36");
  iconLine(ctx, "for you", null, "", H / 2 + 150, 84, clamp((lt - 0.45) / 0.5));
  ctx.restore();
}

function productGrid(ctx: CanvasRenderingContext2D, a: PromoAssets, t: number, alpha: number, clearCenter: number) {
  if (alpha <= 0 || !a.products.length) return;
  const cols = 5, rows = 9, cw = W / cols, rh = H / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = (r * cols + c * 3) % a.products.length;
      const img = a.products[i].img;
      const cx = c * cw + cw / 2 + Math.sin(t * 0.9 + r + c) * 6;
      const cy = r * rh + rh / 2 + Math.cos(t * 0.8 + r * 2 + c) * 6;
      // clear a soft hole in the middle for the title
      const d = Math.hypot((cx - W / 2) / W, (cy - H / 2) / H);
      const hole = clamp((d - 0.12 * clearCenter) / 0.14);
      ctx.save();
      ctx.globalAlpha = alpha * lerp(1, hole, clearCenter);
      const s = 110;
      const f = fitContain(img, cx - s / 2, cy - s / 2, s, s);
      ctx.drawImage(img, f.x, f.y, f.w, f.h);
      ctx.restore();
    }
  }
}

export function renderMuse(ctx: CanvasRenderingContext2D, t: number, a: PromoAssets) {
  canvas(ctx, t);
  const noosho = a.noosho.idle;

  // 1. grid of real products, then it opens up for the title
  productGrid(ctx, a, t, win(t, beats.grid, 0.3), clamp((t - 1.6) / 1));
  const a1 = win(t, beats.title1);
  if (a1 > 0) iconLine(ctx, "Noosho", noosho, "is", H / 2, 96, a1);
  const a2 = win(t, beats.title2);
  if (a2 > 0) {
    iconLine(ctx, "your", noosho, "interior", H / 2 - 60, 96, a2);
    iconLine(ctx, "designer", null, "", H / 2 + 70, 96, clamp((t - beats.title2[0] - 0.2) / 0.5) * a2);
  }

  // 2. a prompt being typed
  const ap = win(t, beats.prompt);
  if (ap > 0) {
    const lt = t - beats.prompt[0];
    const text = "Redesign my living room";
    const n = Math.floor(clamp((lt - 0.4) / 1.6) * text.length);
    ctx.save();
    ctx.globalAlpha = ap;
    ctx.shadowColor = "rgba(24,20,16,0.10)";
    ctx.shadowBlur = 40;
    ctx.fillStyle = "#fff";
    roundRect(ctx, 90, H / 2 - 60, W - 180, 120, 60);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.fillStyle = INK;
    ctx.font = `300 60px ${UI}`;
    ctx.textBaseline = "middle";
    ctx.fillText("+", 140, H / 2 + 2);
    ctx.font = `400 42px ${UI}`;
    const shown = text.slice(0, n);
    ctx.fillText(shown, 205, H / 2 + 2);
    if (Math.floor(lt * 2) % 2 === 0) {
      ctx.fillRect(205 + ctx.measureText(shown).width + 4, H / 2 - 24, 3, 50);
    }
    ctx.restore();
    avatar(ctx, a, W / 2, H / 2 - 320, "peek", "Noosho · listening", ap * clamp((lt - 1.9) / 0.4));
  }

  // 3. shopping: real UI fragments drifting, the avatar moving between them
  const as = win(t, beats.shopping);
  if (as > 0) {
    const lt = t - beats.shopping[0];
    ctx.save();
    ctx.globalAlpha = as;
    const drift = lt * 18;
    // the room photo, cropped off the left edge like the reference's cards
    const ph: Rect = { x: -120, y: 420 - drift, w: 560, h: 720 };
    ctx.shadowColor = "rgba(24,20,16,0.12)";
    ctx.shadowBlur = 40;
    ctx.fillStyle = "#fff";
    roundRect(ctx, ph.x, ph.y, ph.w, ph.h, 34);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.save();
    roundRect(ctx, ph.x, ph.y, ph.w, ph.h, 34);
    ctx.clip();
    drawCover(ctx, a.before, ph.x, ph.y, ph.w, ph.h);
    ctx.restore();
    // product cards off the right
    a.products.slice(0, 4).forEach((p, i) => {
      const r: Rect = { x: 620 + (i % 2) * 230, y: 520 + Math.floor(i / 2) * 250 - drift * 0.6 + (1 - easeOutBack(clamp((lt - i * 0.2) / 0.5))) * 120, w: 210, h: 210 };
      ctx.shadowColor = "rgba(24,20,16,0.12)";
      ctx.shadowBlur = 30;
      ctx.fillStyle = "#fff";
      roundRect(ctx, r.x, r.y, r.w, r.h, 28);
      ctx.fill();
      ctx.shadowColor = "transparent";
      const f = fitContain(p.img, r.x + 18, r.y + 18, r.w - 36, r.h - 36);
      ctx.drawImage(p.img, f.x, f.y, f.w, f.h);
    });
    // an order-style card at the bottom, like the reference's "wants to place an order"
    const oc: Rect = { x: 160, y: 1250 - drift * 0.4, w: W - 320, h: 230 };
    ctx.shadowColor = "rgba(24,20,16,0.12)";
    ctx.shadowBlur = 40;
    ctx.fillStyle = "#fff";
    roundRect(ctx, oc.x, oc.y, oc.w, oc.h, 32);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.fillStyle = INK;
    ctx.font = `600 34px ${UI}`;
    ctx.textBaseline = "alphabetic";
    ctx.fillText("🛒  Noosho picked 8 pieces", oc.x + 36, oc.y + 70);
    ctx.fillStyle = "#71717a";
    ctx.font = `400 28px ${UI}`;
    ctx.fillText("Real products · live prices · one tap to buy", oc.x + 36, oc.y + 120);
    ctx.fillStyle = CLAY;
    roundRect(ctx, oc.x + 36, oc.y + 150, 260, 56, 28);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = `600 26px ${UI}`;
    ctx.fillText("Shop the look", oc.x + 70, oc.y + 187);
    ctx.restore();
    const ax = lerp(W * 0.3, W * 0.62, easeInOutCubic(clamp(lt / 3)));
    avatar(ctx, a, ax, 330, "carry", lt < 1.4 ? "Noosho · studying the room" : "Noosho · shopping on Amazon", as);
  }

  // 4. refrains and the reveal between them
  refrain(ctx, t, beats.refrain1, a.noosho.idea, "redesigns your room");
  const ar = win(t, beats.reveal);
  if (ar > 0) {
    const lt = t - beats.reveal[0];
    const r: Rect = { x: 140, y: 380, w: 800, h: 1060 };
    ctx.save();
    ctx.globalAlpha = ar;
    ctx.shadowColor = "rgba(24,20,16,0.16)";
    ctx.shadowBlur = 50;
    ctx.fillStyle = "#fff";
    roundRect(ctx, r.x, r.y, r.w, r.h, 40);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.save();
    roundRect(ctx, r.x, r.y, r.w, r.h, 40);
    ctx.clip();
    drawCover(ctx, a.before, r.x, r.y, r.w, r.h);
    const wipe = easeInOutCubic(clamp((lt - 0.3) / 0.7));
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w * wipe, r.h);
    ctx.clip();
    drawCover(ctx, a.after, r.x, r.y, r.w, r.h);
    ctx.restore();
    a.products.filter((p) => p.x != null).forEach((p, i) => {
      const k = easeOutBack(clamp((lt - 1.2 - i * 0.07) / 0.3));
      if (k <= 0) return;
      ctx.save();
      ctx.translate(r.x + (p.x! / 100) * r.w, r.y + (p.y! / 100) * r.h);
      ctx.scale(k, k);
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = CLAY; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    });
    for (let i = 0; i < 6; i++) {
      const p = clamp((lt - 0.9 - i * 0.04) / 0.8);
      if (p <= 0 || p >= 1) continue;
      ctx.save();
      ctx.globalAlpha = (1 - p) * ar;
      const ang = (i / 6) * Math.PI * 2;
      star(ctx, W / 2 + Math.cos(ang) * 360 * p, 900 + Math.sin(ang) * 480 * p, 20, CLAY);
      ctx.restore();
    }
    ctx.restore();
    avatar(ctx, a, W / 2, 230, "celebrate", "Noosho · done ✨", ar);
  }
  refrain(ctx, t, beats.refrain2, a.cards[1]?.img ?? null, "plans your birthday");
  refrain(ctx, t, beats.refrain3, a.products[0]?.img ?? null, "shops real pieces");

  // 5. back to the grid: "It's your Noosho"
  const ag = win(t, beats.gridEnd);
  if (ag > 0) {
    productGrid(ctx, a, t, ag, 1);
    iconLine(ctx, "It’s your", noosho, "Noosho", H / 2, 72, ag);
  }

  // 6. logo
  // the logo fades in and holds to the last frame
  if (t >= beats.logo[0]) {
    const lt = t - beats.logo[0];
    ctx.save();
    ctx.globalAlpha = clamp(lt / 0.5);
    iconLine(ctx, "Design that", null, "", H / 2 - 170, 76, clamp(lt / 0.5));
    iconLine(ctx, "shops for you", null, "", H / 2 - 70, 76, clamp((lt - 0.2) / 0.5));
    drawLockup(ctx, H / 2 + 120, 84, clamp((lt - 0.4) / 0.8), clamp((lt - 0.7) / 0.6));
    ctx.restore();
  }
}
