/**
 * Style: inside the app. A phone fills the frame and every beat is the real
 * noosho UI, recreated on canvas: the picker with Noosho's bubble, the upload,
 * the wait screen with the catalog, the reveal, and a tap that opens a product.
 */
import {
  drawCover,
  fitContain,
  roundRect,
  drawLockup,
  drawBackdrop,
  clamp,
  lerp,
  easeOutBack,
  easeOutCubic,
  easeInOutCubic,
  REEL_W as W,
  REEL_H as H,
  INK,
  CLAY,
  SORA,
  UI,
  type Rect,
} from "@/lib/revealVideo";
import { drawNoosho, drawCaption, pill, star, type PromoAssets, type Timeline } from "../promo";

const PHONE: Rect = { x: 190, y: 330, w: 700, h: 1440 };
const S: Rect = { x: PHONE.x + 22, y: PHONE.y + 22, w: PHONE.w - 44, h: PHONE.h - 44 }; // screen
const LINEN = "#FAF6F0";

function bubble(ctx: CanvasRenderingContext2D, a: PromoAssets, pose: Parameters<typeof drawNoosho>[2], text: string, y: number, lt: number) {
  drawNoosho(ctx, a, pose, S.x + 80, y + 40, 130, { t: lt, bob: 3 });
  const p = easeOutBack(clamp(lt / 0.3));
  ctx.save();
  ctx.font = `500 30px ${UI}`;
  const w = Math.min(S.w - 190, ctx.measureText(text).width + 44);
  ctx.translate(S.x + 150, y - 40);
  ctx.scale(p, p);
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#e7e2dc";
  ctx.lineWidth = 2;
  roundRect(ctx, 0, 0, w, 76, 26);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.textBaseline = "middle";
  ctx.fillText(text, 22, 39, w - 40);
  ctx.restore();
}

function optionCard(ctx: CanvasRenderingContext2D, y: number, title: string, sub: string, active: number) {
  const r: Rect = { x: S.x + 36, y, w: S.w - 72, h: 150 };
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = active > 0 ? CLAY : "#e7e2dc";
  ctx.lineWidth = active > 0 ? 5 : 2;
  roundRect(ctx, r.x, r.y, r.w, r.h, 30);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#fbeee6";
  roundRect(ctx, r.x + 28, r.y + 35, 80, 80, 20);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.font = `600 36px ${SORA}`;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(title, r.x + 136, r.y + 68);
  ctx.fillStyle = "#71717a";
  ctx.font = `400 26px ${UI}`;
  ctx.fillText(sub, r.x + 136, r.y + 110);
}

function tap(ctx: CanvasRenderingContext2D, x: number, y: number, lt: number) {
  if (lt < 0 || lt > 0.7) return;
  ctx.save();
  ctx.globalAlpha = 1 - lt / 0.7;
  ctx.fillStyle = "rgba(24,20,16,0.25)";
  ctx.beginPath(); ctx.arc(x, y, 34, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(24,20,16,0.5)"; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(x, y, 34 + lt * 90, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

export function renderPhone(ctx: CanvasRenderingContext2D, t: number, a: PromoAssets, tl: Timeline) {
  drawBackdrop(ctx, t);
  const L = tl.lines.map(([s]) => s);
  const outro = L[9] - 0.2;

  // the phone lifts away for the outro
  const away = easeInOutCubic(clamp((t - outro) / 0.5));
  ctx.save();
  ctx.translate(0, away * 1600);
  // bezel
  ctx.save();
  ctx.shadowColor = "rgba(24,20,16,0.3)";
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 24;
  ctx.fillStyle = "#16120f";
  roundRect(ctx, PHONE.x, PHONE.y, PHONE.w, PHONE.h, 96);
  ctx.fill();
  ctx.restore();
  ctx.save();
  roundRect(ctx, S.x, S.y, S.w, S.h, 78);
  ctx.clip();
  ctx.fillStyle = LINEN;
  ctx.fillRect(S.x, S.y, S.w, S.h);
  // app header
  ctx.fillStyle = INK;
  ctx.font = `600 34px ${SORA}`;
  ctx.textBaseline = "middle";
  ctx.fillText("noosho", S.x + 44, S.y + 90);

  if (t < L[4] - 0.2) {
    // ── picker ──
    const lt = t;
    bubble(ctx, a, "wave", "hi, i’m Noosho 👋 pick one and i’ll do the rest", S.y + 230, lt - 0.3);
    ctx.fillStyle = INK;
    ctx.font = `700 46px ${SORA}`;
    ctx.fillText("What are we designing?", S.x + 36, S.y + 370);
    const roomOn = t > L[1] - 0.05 && t < L[2] - 0.1 ? 1 : 0;
    const eventOn = t >= L[2] - 0.1 ? 1 : 0;
    optionCard(ctx, S.y + 440, "Plan an event", "Birthdays, anniversaries & more", eventOn);
    optionCard(ctx, S.y + 620, "Redesign a room", "Restyle any space, shop the look", roomOn);
    tap(ctx, S.x + S.w - 150, S.y + 695, t - L[1]);
    tap(ctx, S.x + S.w - 150, S.y + 515, t - L[2]);
    // occasion chips pop as she names them
    [["🎂 Birthday", L[2]], ["💞 Anniversary", L[3]]].forEach(([label, at], i) => {
      const p = easeOutBack(clamp((t - (at as number)) / 0.3));
      if (p <= 0) return;
      ctx.save();
      ctx.translate(S.x + 190 + i * 300, S.y + 880);
      ctx.scale(p, p);
      pill(ctx, label as string, 0, 0, 30, CLAY, "#fff");
      ctx.restore();
    });
    // a peek at what she can make
    a.cards.forEach((c, i) => {
      const p = easeOutCubic(clamp((t - L[1 + i]) / 0.35));
      if (p <= 0) return;
      const r: Rect = { x: S.x + 36 + i * 210, y: S.y + 980 + (1 - p) * 60, w: 190, h: 250 };
      ctx.save();
      ctx.globalAlpha = p;
      roundRect(ctx, r.x, r.y, r.w, r.h, 22);
      ctx.clip();
      drawCover(ctx, c.img, r.x, r.y, r.w, r.h);
      ctx.restore();
    });
  } else if (t < L[5] - 0.2) {
    // ── upload ──
    const lt = t - (L[4] - 0.2);
    ctx.fillStyle = INK;
    ctx.font = `700 46px ${SORA}`;
    ctx.fillText("Add a photo of the space", S.x + 36, S.y + 200);
    const box: Rect = { x: S.x + 36, y: S.y + 260, w: S.w - 72, h: 820 };
    ctx.setLineDash([14, 12]);
    ctx.strokeStyle = "#d6cfc7";
    ctx.lineWidth = 4;
    roundRect(ctx, box.x, box.y, box.w, box.h, 30);
    ctx.stroke();
    ctx.setLineDash([]);
    const drop = easeOutBack(clamp((lt - 0.35) / 0.4));
    if (drop > 0) {
      ctx.save();
      ctx.globalAlpha = clamp(drop);
      roundRect(ctx, box.x, box.y + (1 - drop) * 80, box.w, box.h, 30);
      ctx.clip();
      drawCover(ctx, a.before, box.x, box.y + (1 - drop) * 80, box.w, box.h);
      ctx.restore();
    }
    tap(ctx, box.x + box.w / 2, box.y + box.h / 2, lt - 0.15);
    const cta = clamp((lt - 0.7) / 0.3);
    ctx.globalAlpha = cta;
    ctx.fillStyle = CLAY;
    roundRect(ctx, S.x + 36, S.y + 1130, S.w - 72, 110, 30);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = `600 36px ${UI}`;
    ctx.textAlign = "center";
    ctx.fillText("Create my design", S.x + S.w / 2, S.y + 1186);
    ctx.textAlign = "left";
    ctx.globalAlpha = 1;
  } else if (t < L[7] - 0.15) {
    // ── wait screen: Noosho shopping, catalog filling ──
    const lt = t - (L[5] - 0.2);
    const dur = L[7] - 0.15 - (L[5] - 0.2);
    const ph: Rect = { x: S.x + 36, y: S.y + 150, w: S.w - 72, h: 380 };
    ctx.save();
    roundRect(ctx, ph.x, ph.y, ph.w, ph.h, 26);
    ctx.clip();
    drawCover(ctx, a.before, ph.x, ph.y, ph.w, ph.h);
    const sy = ph.y + ((lt % 1) / 1) * ph.h;
    ctx.fillStyle = "rgba(206,101,51,0.6)";
    ctx.fillRect(ph.x, sy - 3, ph.w, 6);
    ctx.restore();
    bubble(ctx, a, "carry", lt < 1 ? "clocking the vibes ✨" : "raiding amazon rn, brb 🛒", S.y + 650, lt);
    ctx.fillStyle = INK;
    ctx.font = `600 32px ${SORA}`;
    ctx.fillText("Noosho’s picks ✨", S.x + 36, S.y + 790);
    const cell = 132, gap = 16;
    a.products.slice(0, 8).forEach((p, i) => {
      const at = 0.9 + i * 0.12;
      const k = easeOutBack(clamp((lt - at) / 0.35));
      if (k <= 0) return;
      const cx = S.x + 36 + (i % 4) * (cell + gap) + cell / 2;
      const cy = S.y + 860 + Math.floor(i / 4) * (cell + gap) + cell / 2;
      ctx.save();
      ctx.translate(cx, cy - (1 - k) * 90);
      ctx.rotate((i % 2 ? 0.06 : -0.07) * k);
      ctx.scale(k, k);
      ctx.fillStyle = "#fff";
      const picked = lt > dur * 0.72 + i * 0.05;
      ctx.strokeStyle = picked ? CLAY : "#e7e2dc";
      ctx.lineWidth = picked ? 5 : 2;
      roundRect(ctx, -cell / 2, -cell / 2, cell, cell, 18);
      ctx.fill();
      ctx.stroke();
      const f = fitContain(p.img, -cell / 2 + 10, -cell / 2 + 10, cell - 20, cell - 20);
      ctx.drawImage(p.img, f.x, f.y, f.w, f.h);
      ctx.restore();
    });
  } else {
    // ── result: reveal, pins, tap → product sheet ──
    const lt = t - (L[7] - 0.15);
    const img: Rect = { x: S.x, y: S.y + 140, w: S.w, h: S.w * 1.33 };
    ctx.save();
    ctx.beginPath();
    ctx.rect(img.x, img.y, img.w, img.h);
    ctx.clip();
    drawCover(ctx, a.before, img.x, img.y, img.w, img.h);
    const wipe = easeInOutCubic(clamp(lt / 0.5));
    ctx.beginPath();
    ctx.rect(img.x, img.y, img.w * wipe, img.h);
    ctx.clip();
    drawCover(ctx, a.after, img.x, img.y, img.w, img.h);
    ctx.restore();
    for (let i = 0; i < 6; i++) {
      const p = clamp((lt - 0.45 - i * 0.03) / 0.6);
      if (p <= 0 || p >= 1) continue;
      ctx.save();
      ctx.globalAlpha = 1 - p;
      const ang = (i / 6) * Math.PI * 2;
      star(ctx, S.x + S.w / 2 + Math.cos(ang) * 240 * p, img.y + img.h / 2 + Math.sin(ang) * 300 * p, 20, "#fff");
      ctx.restore();
    }
    const pinsAt = L[8] - (L[7] - 0.15);
    const pins = a.products.filter((p) => p.x != null);
    pins.forEach((p, i) => {
      const k = easeOutBack(clamp((lt - pinsAt - i * 0.08) / 0.3));
      if (k <= 0) return;
      const px = img.x + (p.x! / 100) * img.w, py = img.y + (p.y! / 100) * img.h;
      ctx.save();
      ctx.translate(px, py);
      ctx.scale(k, k);
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = CLAY; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    });
    bubble(ctx, a, "celebrate", "ta-da! 🎉 tap any piece to shop it", img.y + img.h + 130, lt - 0.4);
    // tap a pin → product sheet slides up
    const first = pins[0];
    if (first) {
      const tapAt = pinsAt + 0.8;
      tap(ctx, img.x + (first.x! / 100) * img.w, img.y + (first.y! / 100) * img.h, lt - tapAt);
      const sh = easeOutCubic(clamp((lt - tapAt - 0.2) / 0.4));
      if (sh > 0) {
        const r: Rect = { x: S.x, y: S.y + S.h - 360 * sh, w: S.w, h: 360 };
        ctx.save();
        ctx.shadowColor = "rgba(24,20,16,0.25)";
        ctx.shadowBlur = 40;
        ctx.fillStyle = "#fff";
        roundRect(ctx, r.x, r.y, r.w, r.h + 60, 44);
        ctx.fill();
        ctx.restore();
        const f = fitContain(first.img, r.x + 40, r.y + 50, 170, 170);
        ctx.drawImage(first.img, f.x, f.y, f.w, f.h);
        ctx.fillStyle = INK;
        ctx.font = `700 44px ${SORA}`;
        ctx.textBaseline = "alphabetic";
        ctx.fillText(first.price || "", r.x + 240, r.y + 120);
        ctx.fillStyle = "#71717a";
        ctx.font = `400 28px ${UI}`;
        ctx.fillText("Real product · ships from Amazon", r.x + 240, r.y + 170);
        ctx.fillStyle = CLAY;
        roundRect(ctx, r.x + 40, r.y + 240, r.w - 80, 90, 26);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.font = `600 34px ${UI}`;
        ctx.textAlign = "center";
        ctx.fillText("Buy on Amazon", r.x + r.w / 2, r.y + 297);
        ctx.textAlign = "left";
      }
    }
  }
  ctx.restore(); // screen clip
  ctx.restore(); // lift-away translate

  // outro
  const ot = t - outro;
  if (ot > 0) {
    drawLockup(ctx, 560, 120, clamp(ot / 0.7), clamp((ot - 0.3) / 0.6));
    const p = easeOutBack(clamp((ot - 0.5) / 0.4));
    if (p > 0) {
      ctx.save();
      ctx.translate(W / 2, 740);
      ctx.scale(p, p);
      pill(ctx, "noosho.com", 0, 0, 44, CLAY, "#fff");
      ctx.restore();
    }
    drawNoosho(ctx, a, "wave", W / 2, lerp(H + 120, 1400, easeOutBack(clamp(ot / 0.5))), 600, { t: ot, bob: 8 });
  }
  // captions sit above the phone, clear of Instagram's bottom UI
  drawCaption(ctx, t, tl, 205, 46);
}
