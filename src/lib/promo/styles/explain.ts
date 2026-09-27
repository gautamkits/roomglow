/**
 * Style: "Noosho explains" — one design, talked through by Noosho on a
 * per-design voiceover (see /api/admin/noosho-explain). Line order is fixed by
 * the script builder:
 *   0 hello · 1 the room before · 2 ta-da, the new look + colours ·
 *   3..3+n products with prices · last: shop / noosho.com
 * Every scene starts on its line's segment, so any script length re-times.
 */
import {
  drawCover,
  roundRect,
  drawLockup,
  drawBackdrop,
  fitContain,
  clamp,
  lerp,
  easeOutBack,
  easeOutCubic,
  easeInOutCubic,
  REEL_W as W,
  INK,
  CLAY,
  type Rect,
} from "@/lib/revealVideo";
import { drawNoosho, drawCaption, pill, star, photoCard, CARD, type PromoAssets, type PromoRender, type Timeline, type Seg } from "../promo";

export type ExplainProduct = { img: HTMLImageElement; title: string; price: string };
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
    duration: segments[segments.length - 1][1] + 1.6,
  };
}

const SORA = "Sora, system-ui, sans-serif";

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, bg: string, fg: string) {
  ctx.save();
  ctx.font = `700 40px ${SORA}`;
  const w = ctx.measureText(text).width + 56;
  ctx.fillStyle = bg;
  roundRect(ctx, x, y, w, 72, 36);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + 28, y + 37);
  ctx.restore();
}

function productCard(ctx: CanvasRenderingContext2D, p: ExplainProduct, k: number) {
  const r: Rect = { x: 170, y: 250, w: 740, h: 900 };
  ctx.save();
  ctx.globalAlpha *= clamp(k);
  ctx.translate(W / 2, r.y + r.h / 2);
  const s = 0.8 + 0.2 * easeOutBack(clamp(k));
  ctx.scale(s, s);
  ctx.translate(-W / 2, -(r.y + r.h / 2));
  ctx.shadowColor = "rgba(24,20,16,0.2)";
  ctx.shadowBlur = 50;
  ctx.shadowOffsetY = 18;
  ctx.fillStyle = "#fff";
  roundRect(ctx, r.x, r.y, r.w, r.h, 44);
  ctx.fill();
  ctx.shadowColor = "transparent";
  const box = fitContain(p.img, r.x + 60, r.y + 60, r.w - 120, 560);
  ctx.drawImage(p.img, box.x, box.y, box.w, box.h);
  ctx.fillStyle = INK;
  ctx.font = `600 38px ${SORA}`;
  ctx.textAlign = "center";
  const title = p.title.length > 34 ? p.title.slice(0, 33).trimEnd() + "…" : p.title;
  ctx.fillText(title, W / 2, r.y + 700);
  ctx.restore();
  // price bursts in a beat after the card
  const pk = easeOutBack(clamp((k - 0.6) / 0.6));
  if (pk > 0) {
    ctx.save();
    ctx.translate(W / 2, r.y + 800);
    ctx.scale(pk, pk);
    pill(ctx, p.price, 0, 0, 58, CLAY, "#fff");
    ctx.restore();
  }
}

export function makeExplainRender(x: ExplainExtras): PromoRender {
  return (ctx: CanvasRenderingContext2D, t: number, a: PromoAssets, tl: Timeline) => {
    drawBackdrop(ctx, t);
    const L = tl.lines.map(([s]) => s);
    const at = (i: number) => Math.max(0, L[i] - 0.25);
    const n = x.products.length;
    const last = L.length - 1;

    if (t < at(1)) {
      // Hello frends! — she hops in and waves
      const p = easeOutBack(clamp(t / 0.7));
      drawLockup(ctx, 330, 90, clamp((t - 0.3) / 1), clamp((t - 0.7) / 0.8));
      drawNoosho(ctx, a, "wave", W / 2, 1360, 700 * p, { t, bob: 6 });
      for (let i = 0; i < 6; i++) {
        const sp = clamp((t - 0.4 - i * 0.12) / 0.6);
        if (sp <= 0 || sp >= 1) continue;
        ctx.save();
        ctx.globalAlpha = Math.sin(sp * Math.PI);
        const ang = (i / 6) * Math.PI * 2;
        star(ctx, W / 2 + Math.cos(ang) * 380 * sp, 1000 + Math.sin(ang) * 300 * sp, 22, i % 2 ? CLAY : "#f3c9a8");
        ctx.restore();
      }
    } else if (t < at(2)) {
      // the room as it was
      const lt = t - at(1);
      const p = easeOutCubic(clamp(lt / 0.6));
      ctx.save();
      ctx.globalAlpha = p;
      photoCard(ctx, a.before, CARD);
      label(ctx, "BEFORE", CARD.x + 30, CARD.y + 30, "rgba(24,20,16,0.75)", "#fff");
      ctx.restore();
      drawNoosho(ctx, a, "peek", lerp(1150, 870, easeOutCubic(clamp(lt / 0.8))), 1440, 420, { t, bob: 4 });
    } else if (t < at(3)) {
      // ta-da: wipe to the new look, colour swatches pop in
      const lt = t - at(2);
      const wipe = easeInOutCubic(clamp(lt / 1.1));
      photoCard(ctx, a.before, CARD);
      ctx.save();
      roundRect(ctx, CARD.x, CARD.y, CARD.w * wipe, CARD.h, 36);
      ctx.clip();
      drawCover(ctx, a.after, CARD.x, CARD.y, CARD.w, CARD.h);
      ctx.restore();
      if (wipe > 0 && wipe < 1) {
        ctx.fillStyle = "#fff";
        ctx.fillRect(CARD.x + CARD.w * wipe - 4, CARD.y, 8, CARD.h);
      }
      if (wipe >= 1) label(ctx, "AFTER", CARD.x + 30, CARD.y + 30, CLAY, "#fff");
      const segDur = Math.max(1.5, (at(3) - at(2)) - 0.4);
      x.palette.forEach((c, i) => {
        const k = easeOutBack(clamp((lt - 1 - (i * segDur * 0.6) / Math.max(1, x.palette.length)) / 0.45));
        if (k <= 0) return;
        const cx = 290 + i * 250, cy = CARD.y + CARD.h - 20;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(k, k);
        ctx.shadowColor = "rgba(0,0,0,0.25)";
        ctx.shadowBlur = 20;
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(0, 0, 80, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowColor = "transparent";
        ctx.fillStyle = c.hex;
        ctx.beginPath();
        ctx.arc(0, 0, 66, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = INK;
        ctx.font = `600 30px ${SORA}`;
        ctx.textAlign = "center";
        ctx.fillText(c.name.length > 14 ? c.name.slice(0, 13) + "…" : c.name, 0, 125);
        ctx.restore();
      });
      const cheer = lt > 0.9 && lt < 2.2;
      drawNoosho(ctx, a, cheer ? "celebrate" : "idea", 900, 1450, 360, {
        t, bob: 4, jump: cheer ? Math.abs(Math.sin(lt * 6)) * 40 : 0,
      });
    } else if (n > 0 && t < at(last)) {
      // products, one per line, each with its real price
      let idx = 0;
      while (idx < n - 1 && t >= at(4 + idx)) idx++;
      const lt = t - at(3 + idx);
      // the finished room stays softly behind
      ctx.save();
      ctx.globalAlpha = 0.25;
      drawCover(ctx, a.after, 0, 0, W, 1920);
      ctx.restore();
      productCard(ctx, x.products[idx], lt / 0.5);
      // progress dots
      for (let d = 0; d < n; d++) {
        ctx.fillStyle = d === idx ? CLAY : "rgba(24,20,16,0.2)";
        ctx.beginPath();
        ctx.arc(W / 2 + (d - (n - 1) / 2) * 40, 1200, d === idx ? 12 : 9, 0, Math.PI * 2);
        ctx.fill();
      }
      drawNoosho(ctx, a, "carry", 180, 1460, 360, { t, bob: 5, flip: idx % 2 === 1 });
    } else {
      // outro: shop it at noosho.com
      const ot = t - at(last);
      drawLockup(ctx, 480, 110, clamp(ot / 1), clamp((ot - 0.4) / 0.8));
      const p = easeOutCubic(clamp((ot - 0.8) / 0.6));
      ctx.globalAlpha = p;
      pill(ctx, "noosho.com", W / 2, 680, 46, CLAY, "#fff");
      ctx.globalAlpha = 1;
      drawNoosho(ctx, a, "celebrate", W / 2, 1360, 600, { t: ot, bob: 6, jump: Math.abs(Math.sin(ot * 4)) * 24 });
    }
    drawCaption(ctx, t, tl);
  };
}
