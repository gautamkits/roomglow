/**
 * Style: cozy storybook, on the calm voiceover. Warm paper, slow page turns,
 * and the key moment: Noosho strolls across the empty room and each piece of
 * furniture blooms into place as she passes its spot (a soft circular reveal of
 * the finished design, centred on that product's hotspot).
 */
import {
  drawCover,
  roundRect,
  drawLockup,
  clamp,
  lerp,
  easeOutBack,
  easeOutCubic,
  easeInOutSine,
  REEL_W as W,
  REEL_H as H,
  CLAY,
  type Rect,
} from "@/lib/revealVideo";
import { drawNoosho, drawCaption, pill, star, CARD, type PromoAssets, type Timeline } from "../promo";

const PAPER = "#F6EFE3";
let paper: HTMLCanvasElement | null = null;
let bloom: HTMLCanvasElement | null = null;

/** Warm paper with a faint grain, built once. */
function paperTexture(): HTMLCanvasElement {
  if (paper) return paper;
  paper = document.createElement("canvas");
  paper.width = W;
  paper.height = H;
  const c = paper.getContext("2d")!;
  c.fillStyle = PAPER;
  c.fillRect(0, 0, W, H);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 16000; i++) {
    c.fillStyle = `rgba(120,90,60,${0.025 + rnd() * 0.035})`;
    c.fillRect(rnd() * W, rnd() * H, 1.6, 1.6);
  }
  const v = c.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.75);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(110,70,40,0.16)");
  c.fillStyle = v;
  c.fillRect(0, 0, W, H);
  return paper;
}

function framed(ctx: CanvasRenderingContext2D, img: HTMLImageElement, r: Rect, rot = 0) {
  ctx.save();
  ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
  ctx.rotate(rot);
  ctx.translate(-r.w / 2, -r.h / 2);
  ctx.shadowColor = "rgba(90,60,30,0.25)";
  ctx.shadowBlur = 36;
  ctx.shadowOffsetY = 14;
  ctx.fillStyle = "#fffaf2";
  roundRect(ctx, -16, -16, r.w + 32, r.h + 32, 18);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.save();
  roundRect(ctx, 0, 0, r.w, r.h, 10);
  ctx.clip();
  drawCover(ctx, img, 0, 0, r.w, r.h);
  // warm storybook grade
  ctx.fillStyle = "rgba(255,200,140,0.10)";
  ctx.fillRect(0, 0, r.w, r.h);
  ctx.restore();
  ctx.restore();
}

/** A little heart, for Noosho's happiest moments. */
function heart(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, fill: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s / 20, s / 20);
  ctx.beginPath();
  ctx.moveTo(0, 6);
  ctx.bezierCurveTo(-20, -8, -10, -24, 0, -12);
  ctx.bezierCurveTo(10, -24, 20, -8, 0, 6);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();
}

export function renderStorybook(ctx: CanvasRenderingContext2D, t: number, a: PromoAssets, tl: Timeline) {
  ctx.drawImage(paperTexture(), 0, 0);
  const L = tl.lines.map(([s]) => s);
  const at = (i: number) => Math.max(0, L[i] - 0.3);

  // gentle sun rays from the top corner
  ctx.save();
  ctx.globalAlpha = 0.12 + 0.04 * Math.sin(t * 0.8);
  for (let i = 0; i < 5; i++) {
    const ang = 0.35 + i * 0.12;
    ctx.fillStyle = "#ffd9a8";
    ctx.beginPath();
    ctx.moveTo(W, 0);
    ctx.lineTo(W - Math.cos(ang) * 2200, Math.sin(ang) * 2200);
    ctx.lineTo(W - Math.cos(ang + 0.05) * 2200, Math.sin(ang + 0.05) * 2200);
    ctx.fill();
  }
  ctx.restore();

  if (t < at(1)) {
    // Noosho strolls in and waves
    const walk = easeInOutSine(clamp(t / 2.4));
    const x = lerp(-200, W / 2, walk);
    const stepping = walk < 1;
    drawNoosho(ctx, a, stepping ? "idle" : "wave", x, 1300, 700, {
      rot: stepping ? Math.sin(t * 7) * 0.04 : 0,
      jump: stepping ? Math.abs(Math.sin(t * 7)) * 12 : 0,
      t,
      bob: stepping ? 0 : 5,
    });
    drawLockup(ctx, 330, 84, clamp((t - 1.2) / 1.2), clamp((t - 1.6) / 1));
  } else if (t < at(4)) {
    // three storybook pages turn in: rooms, birthdays, anniversaries
    a.cards.forEach((c, i) => {
      const p = easeOutCubic(clamp((t - at(1 + i)) / 0.8));
      if (p <= 0) return;
      const r: Rect = { x: 160 + i * 40, y: 300 + i * 70, w: 700, h: 880 };
      ctx.save();
      ctx.globalAlpha = p;
      ctx.translate((1 - p) * 500, 0);
      framed(ctx, c.img, r, (i - 1) * 0.05 * p);
      ctx.restore();
    });
    // a happy hop each time a page lands
    const since = Math.min(...[1, 2, 3].map((i) => (t >= at(i) ? t - at(i) : 99)));
    const hop = since < 0.45 ? Math.sin((since / 0.45) * Math.PI) * 60 : 0;
    drawNoosho(ctx, a, since < 0.45 ? "celebrate" : "idea", 200, 1400, 380, { t, bob: 5, jump: hop, squash: hop > 0 ? 0 : 0.02 });
  } else if (t < at(5)) {
    // the photo, pinned on the page
    const p = easeOutBack(clamp((t - at(4)) / 0.7));
    ctx.save();
    ctx.translate(W / 2, 750);
    ctx.scale(0.85 + 0.15 * p, 0.85 + 0.15 * p);
    ctx.translate(-W / 2, -750);
    ctx.globalAlpha = clamp(p);
    framed(ctx, a.before, CARD, -0.03 * (1 - p));
    ctx.restore();
    drawNoosho(ctx, a, "peek", 880, 1420, 420, { t, bob: 4 });
  } else if (t < at(8)) {
    // the bloom: she strolls across and the furniture appears as she passes
    const lt = t - at(5);
    const dur = at(8) - at(5);
    const walk = clamp(lt / (dur * 0.8));
    framed(ctx, a.before, CARD);
    const nx = lerp(CARD.x - 60, CARD.x + CARD.w + 60, walk);
    if (!bloom) {
      bloom = document.createElement("canvas");
      bloom.width = CARD.w;
      bloom.height = CARD.h;
    }
    const b = bloom.getContext("2d")!;
    b.clearRect(0, 0, CARD.w, CARD.h);
    const pins = a.products.filter((p) => p.x != null);
    const done = t >= at(7); // "Ta-da!": the whole room settles in
    b.globalCompositeOperation = "source-over";
    if (done) {
      b.globalAlpha = clamp((t - at(7)) / 0.8);
      b.fillStyle = "#000";
      b.fillRect(0, 0, CARD.w, CARD.h);
      b.globalAlpha = 1;
    }
    pins.forEach((p) => {
      const px = (p.x! / 100) * CARD.w, py = (p.y! / 100) * CARD.h;
      const passed = clamp((nx - (CARD.x + px)) / 160);
      const r = easeOutCubic(passed) * 260;
      if (r <= 1) return;
      const g = b.createRadialGradient(px, py, r * 0.35, px, py, r);
      g.addColorStop(0, "rgba(0,0,0,1)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      b.fillStyle = g;
      b.fillRect(px - r, py - r, r * 2, r * 2);
    });
    b.globalCompositeOperation = "source-in";
    drawCover(b, a.after, 0, 0, CARD.w, CARD.h);
    b.globalCompositeOperation = "source-over";
    ctx.save();
    roundRect(ctx, CARD.x, CARD.y, CARD.w, CARD.h, 10);
    ctx.clip();
    ctx.drawImage(bloom, CARD.x, CARD.y);
    ctx.restore();
    // a soft sparkle where each piece blooms
    pins.forEach((p, i) => {
      const px = CARD.x + (p.x! / 100) * CARD.w, py = CARD.y + (p.y! / 100) * CARD.h;
      const s = clamp((nx - px) / 200);
      if (s <= 0 || s >= 1) return;
      ctx.save();
      ctx.globalAlpha = Math.sin(s * Math.PI);
      star(ctx, px, py - 40 * s, 18 + (i % 2) * 6, "#fff");
      ctx.restore();
    });
    const justBloomed = pins.some((p) => {
      const s2 = (nx - (CARD.x + (p.x! / 100) * CARD.w)) / 200;
      return s2 > 0 && s2 < 0.35;
    });
    drawNoosho(ctx, a, walk < 1 ? "idle" : "celebrate", nx, CARD.y + CARD.h + 170, 380, {
      rot: walk < 1 ? Math.sin(lt * 7) * 0.05 : 0,
      jump: walk < 1 ? Math.abs(Math.sin(lt * 7)) * 10 : Math.abs(Math.sin(lt * 5)) * 30,
      mouth: walk < 1 && justBloomed ? "o" : undefined,
    });
    // hearts float up once the whole room is in ("Ta-da!")
    if (done) {
      for (let i = 0; i < 7; i++) {
        const hp = ((t - at(7)) * 0.7 + i / 7) % 1;
        ctx.save();
        ctx.globalAlpha = Math.sin(hp * Math.PI) * 0.9;
        heart(ctx, nx - 160 + i * 52 + Math.sin((t + i) * 3) * 14, CARD.y + CARD.h + 40 - hp * 420, 18 + (i % 3) * 6, i % 2 ? "#F27A9E" : CLAY);
        ctx.restore();
      }
    }
  } else if (t < at(9)) {
    // gentle price tags on the finished room
    const lt = t - at(8);
    framed(ctx, a.after, CARD);
    a.products.filter((p) => p.x != null && p.price).slice(0, 4).forEach((p, i) => {
      const k = easeOutBack(clamp((lt - 0.2 - i * 0.3) / 0.5));
      if (k <= 0) return;
      ctx.save();
      ctx.translate(CARD.x + (p.x! / 100) * CARD.w, CARD.y + (p.y! / 100) * CARD.h);
      ctx.scale(k, k);
      pill(ctx, p.price, 0, 0, 28, "#fffaf2", CLAY);
      ctx.restore();
    });
    drawNoosho(ctx, a, "wave", 890, 1420, 380, { t, bob: 5 });
  } else {
    const ot = t - at(9);
    drawLockup(ctx, 520, 110, clamp(ot / 1.2), clamp((ot - 0.5) / 1));
    const p = easeOutCubic(clamp((ot - 1) / 0.8));
    ctx.globalAlpha = p;
    pill(ctx, "noosho.com", W / 2, 700, 42, CLAY, "#fff");
    ctx.globalAlpha = 1;
    drawNoosho(ctx, a, "wave", W / 2, 1330, 620, { t: ot, bob: 6 });
  }
  drawCaption(ctx, t, tl);
}
