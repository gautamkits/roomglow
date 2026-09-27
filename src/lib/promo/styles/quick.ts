/**
 * Style: "Noosho quick" — the ~12s cut of "Noosho explains", built for
 * completion rate. Noosho speaks four short lines; the prices are shown, not
 * read, and add up to the whole-look total (the hook's answer, held back to
 * the end). The last frame matches the first so the reel loops seamlessly.
 *
 * Lines: 0 hook · 1 before · 2 "Ta-da!" · [silent price section] · 3 CTA.
 * The silence is baked into the voice WAV by the route (`gap` before line 3),
 * sized by {@link quickGapSeconds}.
 */
import {
  roundRect,
  clamp,
  easeOutBack,
  easeOutCubic,
  easeInOutCubic,
  REEL_W as W,
  INK,
  CLAY,
} from "@/lib/revealVideo";
import { pill, star, type PromoAssets, type PromoRender, type Timeline } from "../promo";
import {
  CARD,
  RADIUS,
  SORA,
  backdrop,
  cardFrame,
  cardImage,
  coverRect,
  tag,
  host,
  speech,
  pinDot,
  type ExplainProduct,
} from "./explain";

export type QuickExtras = {
  products: ExplainProduct[];
  palette: { name: string; hex: string }[];
  total: { text: string; partial: boolean } | null;
};

const TADA_HOLD = 0.9; // the reveal breathes before prices start
const PER_PRICE = 0.5;
const TOTAL_HOLD = 1.7; // count-up + a beat to read it

/** Silence to insert before the CTA line for `n` products. */
export function quickGapSeconds(n: number): number {
  return TADA_HOLD + n * PER_PRICE + TOTAL_HOLD;
}

const HOOK_ZOOM = 1.14;

/** "₹12,400" at progress k: same prefix/suffix, the number counting up. */
function countUp(text: string, k: number): string {
  const m = text.match(/[\d,]+(?:\.\d+)?/);
  if (!m) return text;
  const n = parseFloat(m[0].replace(/,/g, ""));
  const cur = Math.round(n * easeOutCubic(clamp(k)));
  const loc = /₹|Rs|INR/i.test(text) ? "en-IN" : "en-US";
  return text.replace(m[0], cur.toLocaleString(loc));
}

function headline(ctx: CanvasRenderingContext2D, text: string, k: number, y = CARD.y + 120) {
  const s = easeOutBack(clamp(k));
  if (s <= 0) return;
  ctx.save();
  // dark fade at the top of the card so white text always reads
  ctx.save();
  roundRect(ctx, CARD.x, CARD.y, CARD.w, CARD.h, RADIUS);
  ctx.clip();
  const g = ctx.createLinearGradient(0, CARD.y, 0, CARD.y + 360);
  g.addColorStop(0, `rgba(24,20,16,${0.6 * clamp(k)})`);
  g.addColorStop(1, "rgba(24,20,16,0)");
  ctx.fillStyle = g;
  ctx.fillRect(CARD.x, CARD.y, CARD.w, 360);
  ctx.restore();
  ctx.translate(W / 2, y);
  ctx.scale(s, s);
  ctx.fillStyle = "#fff";
  ctx.font = `800 78px ${SORA}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 20;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

function totalBar(ctx: CanvasRenderingContext2D, total: QuickExtras["total"], k: number, countK: number) {
  if (!total) return;
  const s = easeOutBack(clamp(k));
  if (s <= 0) return;
  // right of Noosho (she stands over the card's bottom-left)
  const w = 540, h = 190;
  const x = CARD.x + CARD.w - 36 - w, y = CARD.y + CARD.h - h - 36;
  const cx = x + w / 2, cy = y + h / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.translate(-cx, -cy);
  ctx.shadowColor = "rgba(0,0,0,0.4)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 12;
  ctx.fillStyle = CLAY;
  roundRect(ctx, x, y, w, h, 40);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 36px ${SORA}`;
  ctx.fillText(total.partial ? "WHOLE LOOK FROM" : "WHOLE LOOK", cx, y + 48);
  ctx.font = `800 92px ${SORA}`;
  ctx.fillText(countUp(total.text, countK), cx, y + 124);
  ctx.restore();
}

function chips(ctx: CanvasRenderingContext2D, palette: QuickExtras["palette"], lt: number) {
  palette.forEach((c, i) => {
    const k = easeOutBack(clamp((lt - 0.5 - i * 0.18) / 0.35));
    if (k <= 0) return;
    ctx.save();
    ctx.font = `700 38px ${SORA}`;
    const name = c.name.length > 16 ? c.name.slice(0, 15) + "…" : c.name;
    const w = ctx.measureText(name).width + 124;
    ctx.translate(CARD.x + 32, CARD.y + 140 + i * 100 + 36);
    ctx.scale(k, k);
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    roundRect(ctx, 0, -36, w, 72, 36);
    ctx.fill();
    ctx.fillStyle = c.hex;
    ctx.beginPath();
    ctx.arc(38, 0, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.textBaseline = "middle";
    ctx.fillText(name, 74, 2);
    ctx.restore();
  });
}

export function makeQuickRender(x: QuickExtras): PromoRender {
  return (ctx: CanvasRenderingContext2D, t: number, a: PromoAssets, tl: Timeline) => {
    const L = tl.lines.map(([s]) => s);
    const at = (i: number) => Math.max(0, L[i] - 0.2);
    const priceStart = tl.lines[2][1] + TADA_HOLD;
    const totalStart = priceStart + x.products.length * PER_PRICE;
    backdrop(ctx, a.after);

    // The loop frame: the finished design, zoomed, nothing on it. The reel
    // starts here and fades back to it at the very end.
    const loopFrame = () => {
      cardFrame(ctx);
      cardImage(ctx, a.after, HOOK_ZOOM);
    };

    if (t < at(1)) {
      // HOOK — payoff first, and a question the video answers at the end.
      const zoom = HOOK_ZOOM - 0.1 * easeOutCubic(clamp(t / 2));
      cardFrame(ctx);
      cardImage(ctx, a.after, zoom);
      headline(ctx, "Guess the total?", (t - 0.15) / 0.4);
      const p = easeOutBack(clamp((t - 0.05) / 0.45));
      host(ctx, a, "wave", t, [], { h: 750 * p, x: 300, foot: 1600 });
      for (let i = 0; i < 8; i++) {
        const sp = clamp((t - 0.25 - i * 0.06) / 0.6);
        if (sp <= 0 || sp >= 1) continue;
        const ang = (i / 8) * Math.PI * 2;
        ctx.save();
        ctx.globalAlpha = Math.sin(sp * Math.PI);
        star(ctx, 300 + Math.cos(ang) * 340 * sp, 1250 + Math.sin(ang) * 280 * sp, 26, i % 2 ? CLAY : "#ffe1c4");
        ctx.restore();
      }
      speech(ctx, t, tl, { x: 420, y: 1230 });
      return;
    }

    if (t < at(2)) {
      // BEFORE — a fast flip.
      const lt = t - at(1);
      const flip = easeInOutCubic(clamp(lt / 0.35));
      cardFrame(ctx);
      ctx.save();
      ctx.translate(W / 2, 0);
      ctx.scale(Math.abs(1 - 2 * flip) || 0.001, 1);
      ctx.translate(-W / 2, 0);
      cardImage(ctx, flip < 0.5 ? a.after : a.before);
      ctx.restore();
      tag(ctx, "BEFORE", "rgba(24,20,16,0.8)", (lt - 0.35) / 0.25);
      host(ctx, a, "idle", t, L);
      speech(ctx, t, tl);
      return;
    }

    if (t < at(3)) {
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
      const pricing = t >= priceStart;
      if (!pricing) {
        tag(ctx, "AFTER", CLAY, (lt - 0.6) / 0.25);
        chips(ctx, x.palette, lt);
      } else {
        tag(ctx, "SHOP THE LOOK", CLAY);
      }

      // PRICES — shown, not read: pins pop in one after another.
      const cr = coverRect(a.after);
      let loose = 0;
      let lastPop = -99;
      x.products.forEach((p, i) => {
        const pt = priceStart + i * PER_PRICE;
        const k = (t - pt) / 0.3;
        if (k <= 0) return;
        lastPop = Math.max(lastPop, pt);
        if (p.x != null && p.y != null) {
          const px = clamp(cr.x + (p.x / 100) * cr.w, CARD.x + 90, CARD.x + CARD.w - 90);
          const py = clamp(cr.y + (p.y / 100) * cr.h, CARD.y + 130, CARD.y + CARD.h - 240);
          pinDot(ctx, px, py, t, k);
          ctx.save();
          const s = easeOutBack(clamp(k));
          ctx.translate(px, py - 70);
          ctx.scale(s, s);
          pill(ctx, p.price, 0, 0, 40, "#fff", CLAY);
          ctx.restore();
        } else {
          // no spot on the design: stack along the right edge
          ctx.save();
          const s = easeOutBack(clamp(k));
          ctx.translate(CARD.x + CARD.w - 150, CARD.y + 140 + loose++ * 100);
          ctx.scale(s, s);
          pill(ctx, p.price, 0, 0, 40, "#fff", CLAY);
          ctx.restore();
        }
      });
      if (t >= totalStart) totalBar(ctx, x.total, (t - totalStart) / 0.35, (t - totalStart - 0.15) / 0.9);

      const since = t - lastPop;
      const cheer = (lt > 0.3 && lt < 1.4) || (x.total && t > totalStart + 0.9);
      host(ctx, a, cheer ? "celebrate" : "idea", t, L, {
        extraJump: since < 0.3 ? Math.sin((since / 0.3) * Math.PI) * 35 : cheer ? Math.abs(Math.sin(t * 6)) * 30 : 0,
        mouth: pricing && since < 0.25 ? "o" : undefined,
      });
      speech(ctx, t, tl);
      return;
    }

    // CTA — total stays up; the answer to the hook.
    const ot = t - at(3);
    cardFrame(ctx);
    cardImage(ctx, a.after);
    headline(ctx, "Design yours from 1 photo", ot / 0.35, CARD.y + 100);
    const p = easeOutBack(clamp((ot - 0.25) / 0.4));
    if (p > 0) {
      ctx.save();
      ctx.translate(W / 2, CARD.y + 210);
      ctx.scale(p, p);
      pill(ctx, "noosho.com", 0, 0, 48, CLAY, "#fff");
      ctx.restore();
    }
    totalBar(ctx, x.total, 1, 1);
    host(ctx, a, "wave", t, L);
    speech(ctx, t, tl);

    // fade to the loop frame over the last half-second
    const fade = clamp((t - (tl.duration - 0.5)) / 0.5);
    if (fade > 0) {
      ctx.save();
      ctx.globalAlpha = fade;
      backdrop(ctx, a.after);
      loopFrame();
      ctx.restore();
    }
  };
}
