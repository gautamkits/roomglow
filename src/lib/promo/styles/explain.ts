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
  clamp,
  lerp,
  easeOutBack,
  easeOutCubic,
  easeInOutCubic,
  REEL_W as W,
  CLAY,
  type Rect,
} from "@/lib/revealVideo";
import { pickPrices, PRICE_POP, TOTAL_POP } from "../explainPrices";
import { drawNoosho, drawCaption, pill, star, photoCard, sceneOutro, CARD, type PromoAssets, type PromoRender, type Timeline, type Seg } from "../promo";

/** x/y: the product's hotspot on the design, in % of the image. */
export type ExplainProduct = { img: HTMLImageElement; title: string; price: string; x?: number; y?: number };
export type ExplainExtras = {
  products: ExplainProduct[];
  /** "Buy everything for ₹12,400" — shown big in the buy-everything scene. */
  total?: string | null;
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

export function makeExplainRender(x: ExplainExtras): PromoRender {
  return (ctx: CanvasRenderingContext2D, t: number, a: PromoAssets, tl: Timeline) => {
    drawBackdrop(ctx, t);
    const L = tl.lines.map(([s]) => s);
    const at = (i: number) => Math.max(0, L[i] - 0.25);
    const n = x.products.length;
    const last = L.length - 1;
    // The room appears midway through the greeting ("…look at this living room"),
    // not after it — so she is looking at something when she says it.
    const roomIn = Math.min(at(1), tl.lines[0][0] + (tl.lines[0][1] - tl.lines[0][0]) * 0.45);

    if (t < roomIn) {
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
      const lt = t - roomIn;
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
      const cheer = lt > 0.9 && lt < 2.2;
      drawNoosho(ctx, a, cheer ? "celebrate" : "idea", 900, 1450, 360, {
        t, bob: 4, jump: cheer ? Math.abs(Math.sin(lt * 6)) * 40 : 0,
      });
    } else if (last === 4 && t < at(last)) {
      // BUY EVERYTHING: the finished design with every price popping on in
      // quick succession, and the total big across the bottom.
      const lt = t - at(3);
      designView(ctx, a.after, 1, W / 2, 960);
      const cr = coverRect(a.after, CARD);
      ctx.save();
      roundRect(ctx, CARD.x, CARD.y, CARD.w, CARD.h, 36);
      ctx.clip();
      let loose = 0;
      const shown = pickPrices(x.products);
      shown.forEach((p, i) => {
        const k = (lt - PRICE_POP.first - i * PRICE_POP.step) / 0.3;
        if (k <= 0) return;
        const s = easeOutBack(clamp(k));
        const real = p.x != null && p.y != null;
        const px = real ? clamp(cr.x + (p.x! / 100) * cr.w, CARD.x + 80, CARD.x + CARD.w - 80) : CARD.x + CARD.w - 120;
        const py = real ? clamp(cr.y + (p.y! / 100) * cr.h, CARD.y + 190, CARD.y + CARD.h - 200) : CARD.y + 190 + loose++ * 90;
        if (real) pin(ctx, px, py, t, k);
        ctx.save();
        ctx.translate(px, real ? py - 60 : py);
        ctx.scale(s, s);
        pill(ctx, p.price, 0, 0, 34, '#fff', CLAY);
        ctx.restore();
      });
      ctx.restore();
      if (x.total) {
        const k = easeOutBack(clamp((lt - TOTAL_POP - shown.length * PRICE_POP.step) / 0.4));
        if (k > 0) {
          ctx.save();
          ctx.translate(W / 2 - 70, CARD.y + CARD.h - 90); // clear of Noosho, bottom-right
          ctx.scale(k, k);
          pill(ctx, x.total, 0, 0, 44, CLAY, '#fff');
          ctx.restore();
        }
      }
      label(ctx, 'REAL PRODUCTS', CARD.x + 30, CARD.y + 30, CLAY, '#fff');
      drawNoosho(ctx, a, 'celebrate', 900, 1450, 330, { t, bob: 4, jump: Math.abs(Math.sin(lt * 5)) * 20 });
    } else {
      // outro: the promo's own ending ("Let's design yours at noosho.com!")
      sceneOutro(ctx, a, t - at(last));
    }
    drawCaption(ctx, t, tl);
  };
}
