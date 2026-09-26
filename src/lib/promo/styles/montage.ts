/**
 * Style: transformation montage. Rapid before→after flips across many real
 * published designs, landing on the voiceover's beats, Noosho reacting in the
 * corner. Ends on the logo.
 */
import {
  drawCover,
  drawLockup,
  drawBackdrop,
  clamp,
  lerp,
  easeInOutCubic,
  easeOutBack,
  REEL_W as W,
  REEL_H as H,
  INK,
} from "@/lib/revealVideo";
import { drawNoosho, drawCaption, pill, star, type PromoAssets, type Timeline } from "../promo";

export function renderMontage(ctx: CanvasRenderingContext2D, t: number, a: PromoAssets, tl: Timeline) {
  const items = a.gallery.length ? a.gallery : [{ before: a.before, after: a.after, label: "Room" }];
  const outroAt = tl.lines[9][0] - 0.3;
  const start = 0.3;
  const slot = (outroAt - start) / items.length;

  if (t < outroAt + 0.3) {
    const k = Math.min(items.length - 1, Math.max(0, Math.floor((t - start) / slot)));
    const it = items[k];
    const lt = t - start - k * slot;
    // before for ~40% of the slot, a fast wipe, then the after holds
    const wipe = easeInOutCubic(clamp((lt - slot * 0.38) / 0.32));
    const zoom = 1.04 + 0.04 * clamp(lt / slot);
    ctx.save();
    drawCover(ctx, it.before, 0, 0, W, H, zoom);
    ctx.beginPath();
    ctx.rect(0, 0, W * wipe, H);
    ctx.clip();
    drawCover(ctx, it.after, 0, 0, W, H, zoom);
    ctx.restore();
    if (wipe > 0 && wipe < 1) {
      ctx.fillStyle = "#fff";
      ctx.fillRect(W * wipe - 5, 0, 10, H);
    }
    // soft top & bottom shade so chips and captions read on any photo
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "rgba(20,15,11,0.45)");
    g.addColorStop(0.18, "rgba(20,15,11,0)");
    g.addColorStop(0.7, "rgba(20,15,11,0)");
    g.addColorStop(1, "rgba(20,15,11,0.55)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // counter chip
    const chip = easeOutBack(clamp(lt / 0.3));
    ctx.save();
    ctx.translate(110 + 150, 250);
    ctx.scale(chip, chip);
    pill(ctx, `#${k + 1}  ${it.label}`, 0, 0, 34, "rgba(255,255,255,0.95)", INK);
    ctx.restore();
    // BEFORE / AFTER tag
    pill(ctx, wipe < 0.5 ? "BEFORE" : "AFTER", W - 190, 250, 28, wipe < 0.5 ? "rgba(20,15,11,0.7)" : "#a04525", "#fff");
    // sparkles right after each reveal
    for (let i = 0; i < 6; i++) {
      const p = clamp((lt - slot * 0.72 - i * 0.03) / 0.5);
      if (p <= 0 || p >= 1) continue;
      const ang = (i / 6) * Math.PI * 2 + k;
      ctx.save();
      ctx.globalAlpha = 1 - p;
      star(ctx, W / 2 + Math.cos(ang) * 300 * p, 820 + Math.sin(ang) * 380 * p, 22, "#fff");
      ctx.restore();
    }
    // Noosho reacts: peeks during the before, celebrates on the reveal
    const pose = wipe < 1 ? "peek" : "celebrate";
    const j = pose === "celebrate" ? Math.abs(Math.sin(lt * 7)) * 40 : 0;
    drawNoosho(ctx, a, pose, W - 170, H - 330, 300, { t, bob: 5, jump: j });
  }

  // outro
  const ot = t - outroAt;
  if (ot > 0) {
    ctx.save();
    ctx.globalAlpha = clamp(ot / 0.3);
    drawBackdrop(ctx, t);
    drawLockup(ctx, 520, 120, clamp(ot / 0.7), clamp((ot - 0.3) / 0.6));
    const p = easeOutBack(clamp((ot - 0.5) / 0.4));
    if (p > 0) {
      ctx.save();
      ctx.translate(W / 2, 700);
      ctx.scale(p, p);
      pill(ctx, "noosho.com", 0, 0, 44, "#a04525", "#fff");
      ctx.restore();
    }
    drawNoosho(ctx, a, "wave", W / 2, lerp(H + 120, 1330, easeOutBack(clamp(ot / 0.5))), 640, { t: ot, bob: 8 });
    ctx.restore();
  }
  drawCaption(ctx, t, tl);
}
