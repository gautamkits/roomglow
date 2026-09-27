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

/** Where the cover-fitted image lands in `r` (so hotspot %s map to pixels). */
function coverRect(img: HTMLImageElement, r: Rect): Rect {
  const s = Math.max(r.w / img.width, r.h / img.height);
  const w = img.width * s, h = img.height * s;
  return { x: r.x + (r.w - w) / 2, y: r.y + (r.h - h) / 2, w, h };
}

/** The finished design, with an optional gentle push-in toward (fx, fy). */
function designView(ctx: CanvasRenderingContext2D, img: HTMLImageElement, zoom: number, fx: number, fy: number) {
  shadowlessCard(ctx);
  ctx.save();
  roundRect(ctx, CARD.x, CARD.y, CARD.w, CARD.h, 36);
  ctx.clip();
  ctx.translate(fx, fy);
  ctx.scale(zoom, zoom);
  ctx.translate(-fx, -fy);
  drawCover(ctx, img, CARD.x, CARD.y, CARD.w, CARD.h);
  ctx.restore();
}

function shadowlessCard(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.shadowColor = "rgba(24,20,16,0.22)";
  ctx.shadowBlur = 50;
  ctx.shadowOffsetY = 16;
  ctx.fillStyle = "#fff";
  roundRect(ctx, CARD.x, CARD.y, CARD.w, CARD.h, 36);
  ctx.fill();
  ctx.restore();
}

/** Pulsing pin on the product in the design. */
function pin(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, k: number) {
  ctx.save();
  ctx.globalAlpha *= clamp(k);
  const ring = (t * 1.2) % 1;
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 5;
  ctx.globalAlpha *= 1 - ring;
  ctx.beginPath();
  ctx.arc(x, y, 22 + ring * 40, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.globalAlpha *= clamp(k);
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 12;
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(x, y, 22 * easeOutBack(clamp(k)), 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.fillStyle = CLAY;
  ctx.beginPath();
  ctx.arc(x, y, 12 * easeOutBack(clamp(k)), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Price tag: product thumbnail + price + short name, pointing at the pin. */
function priceTag(ctx: CanvasRenderingContext2D, p: ExplainProduct, px: number, py: number, k: number) {
  const w = 480, h = 140;
  // sit above the pin if there's room, else below; keep inside the card
  const above = py - 60 - h > CARD.y + 20;
  const tx = clamp(px - w / 2, CARD.x + 20, CARD.x + CARD.w - 20 - w) as number;
  const ty = above ? py - 60 - h : Math.min(py + 60, CARD.y + CARD.h - 20 - h);
  const s = easeOutBack(clamp(k));
  if (s <= 0) return;
  ctx.save();
  ctx.globalAlpha *= clamp(k * 1.5);
  ctx.translate(px, py);
  ctx.scale(s, s);
  ctx.translate(-px, -py);
  // stem
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(clamp(px, tx + 40, tx + w - 40) as number, above ? ty + h : ty);
  ctx.stroke();
  // card
  ctx.shadowColor = "rgba(24,20,16,0.3)";
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = "#fff";
  roundRect(ctx, tx, ty, w, h, 28);
  ctx.fill();
  ctx.shadowColor = "transparent";
  const thumb = fitContain(p.img, tx + 18, ty + 18, h - 36, h - 36);
  ctx.drawImage(p.img, thumb.x, thumb.y, thumb.w, thumb.h);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = CLAY;
  ctx.font = `800 54px ${SORA}`;
  ctx.fillText(p.price, tx + h + 6, ty + 74);
  ctx.fillStyle = INK;
  ctx.font = `500 24px ${SORA}`;
  const title = p.title.length > 26 ? p.title.slice(0, 25).trimEnd() + "…" : p.title;
  ctx.fillText(title, tx + h + 6, ty + 112);
  ctx.restore();
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
      // The design stays the hero: the camera eases toward each product and its
      // price pins onto it; earlier prices stay as small tags.
      const cr = coverRect(a.after, CARD);
      const spot = (p: ExplainProduct) =>
        p.x != null && p.y != null
          ? { x: cr.x + (p.x / 100) * cr.w, y: cr.y + (p.y / 100) * cr.h, real: true }
          : { x: CARD.x + CARD.w / 2, y: CARD.y + CARD.h - 40, real: false };
      const cur = spot(x.products[idx]);
      const prev = idx > 0 ? spot(x.products[idx - 1]) : { x: CARD.x + CARD.w / 2, y: CARD.y + CARD.h / 2 };
      const move = easeInOutCubic(clamp(lt / 0.7));
      const fx = lerp(prev.x, cur.real ? cur.x : CARD.x + CARD.w / 2, move);
      const fy = lerp(prev.y, cur.real ? cur.y : CARD.y + CARD.h / 2, move);
      const zoom = cur.real ? 1 + 0.16 * easeInOutCubic(clamp(lt / 0.9)) : 1;
      designView(ctx, a.after, zoom, fx, fy);
      const onScreen = (s: { x: number; y: number }) => ({
        x: clamp(fx + (s.x - fx) * zoom, CARD.x + 30, CARD.x + CARD.w - 30) as number,
        y: clamp(fy + (s.y - fy) * zoom, CARD.y + 30, CARD.y + CARD.h - 30) as number,
      });
      ctx.save();
      roundRect(ctx, CARD.x, CARD.y, CARD.w, CARD.h, 36);
      ctx.clip();
      for (let d = 0; d < idx; d++) {
        const s = spot(x.products[d]);
        if (!s.real) continue;
        const o = onScreen(s);
        pill(ctx, x.products[d].price, o.x, o.y, 30, "rgba(255,255,255,0.95)", CLAY);
      }
      const c = onScreen(cur);
      if (cur.real) pin(ctx, c.x, c.y, t, (lt - 0.3) / 0.3);
      priceTag(ctx, x.products[idx], c.x, c.y, (lt - 0.5) / 0.45);
      ctx.restore();
      label(ctx, "SHOP THE LOOK", CARD.x + 30, CARD.y + 30, CLAY, "#fff");
      drawNoosho(ctx, a, "idea", 900, 1450, 330, { t, bob: 4 });
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
