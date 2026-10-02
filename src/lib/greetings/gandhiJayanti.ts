/**
 * Noosho's Gandhi Jayanti greeting reel (1080×1920), voiced and lip-synced.
 *
 * Rendered offline by `scripts/greeting-video.ts` through the dev-only page at
 * /dev/greeting — not part of the app. Scenes follow the voice: each one starts
 * just before Noosho begins its line, so a re-recorded take re-times itself.
 *
 * Deliberately no likeness of Gandhi and no quotes (many popular "Gandhi
 * quotes" are misattributed); the charkha and the values carry the message.
 */
import { drawNoosho, setFrameTime, type NooshoKit } from "@/lib/promo/promo";
import {
  drawLockup, drawBackdrop, roundRect, clamp, lerp, easeOutBack, easeOutCubic, easeOutExpo,
  REEL_W as W, REEL_H as H, INK, CLAY, SORA,
} from "@/lib/revealVideo";
import { GANDHI_LINES, type GreetingTimeline } from "./gandhiJayantiScript";

export { GANDHI_LINES, estimateTimeline, type GreetingTimeline } from "./gandhiJayantiScript";

const SAFFRON = "#FF9933", GREEN = "#138808";

function windowAlpha(t: number, s: number, e: number, fade = 0.35) {
  if (t < s || t > e + fade) return 0;
  const inA = s <= 0 ? 1 : clamp((t - s) / fade);
  return Math.min(inA, 1 - clamp((t - e) / fade));
}

function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string, p: number, weight = 700) {
  if (p <= 0) return;
  ctx.save();
  ctx.globalAlpha *= clamp(p);
  ctx.font = `${weight} ${size}px ${SORA}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(s, x, y + (1 - easeOutExpo(p)) * 30);
  ctx.restore();
}

function kicker(ctx: CanvasRenderingContext2D, s: string, y: number, p: number) {
  if (p <= 0) return;
  ctx.save();
  ctx.globalAlpha *= clamp(p);
  ctx.font = `600 30px ${SORA}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const label = s.toUpperCase().split("").join(" ");
  const w = ctx.measureText(label).width;
  ctx.fillStyle = CLAY;
  ctx.fillText(label, W / 2, y);
  ctx.fillRect(W / 2 - w / 2 - 70, y - 1, 46, 3);
  ctx.fillRect(W / 2 + w / 2 + 24, y - 1, 46, 3);
  ctx.restore();
}

/** Saffron / white / green ribbon drawing out from the centre. */
function ribbon(ctx: CanvasRenderingContext2D, y: number, w: number, p: number) {
  const k = easeOutCubic(p);
  if (k <= 0) return;
  const half = (w / 2) * k, h = 12;
  ctx.save();
  [SAFFRON, "#ffffff", GREEN].forEach((c, i) => {
    ctx.fillStyle = c;
    roundRect(ctx, W / 2 - half, y + i * h, half * 2, h, 4);
    ctx.fill();
  });
  ctx.strokeStyle = "rgba(28,23,20,0.08)";
  ctx.lineWidth = 2;
  roundRect(ctx, W / 2 - half, y, half * 2, h * 3, 6);
  ctx.stroke();
  ctx.restore();
}

/** A charkha: spoked wheel on a stand, thread running to a small spindle. */
function charkha(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, draw: number, spin: number) {
  const d = easeOutCubic(draw);
  if (d <= 0) return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const g = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 1.6);
  g.addColorStop(0, `rgba(255,153,51,${0.22 * d})`);
  g.addColorStop(1, "rgba(255,153,51,0)");
  ctx.fillStyle = g;
  ctx.fillRect(cx - r * 1.7, cy - r * 1.7, r * 3.4, r * 3.4);
  // base + stand
  ctx.strokeStyle = INK;
  ctx.lineWidth = 12;
  ctx.globalAlpha *= clamp(d * 1.5);
  const baseY = cy + r + 70;
  ctx.beginPath();
  ctx.moveTo(cx - r - 40, baseY);
  ctx.lineTo(cx + r + 230, baseY);
  ctx.stroke();
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.55, baseY); ctx.lineTo(cx, cy);
  ctx.moveTo(cx + r * 0.55, baseY); ctx.lineTo(cx, cy);
  ctx.stroke();
  // spindle block
  const sx = cx + r + 170, sy = baseY - 60;
  ctx.fillStyle = CLAY;
  roundRect(ctx, sx - 40, sy, 80, 60, 10);
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(sx - 60, sy + 10); ctx.lineTo(sx + 60, sy + 10); ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.lineCap = "round";
  // rim draws on
  const sweep = Math.min(d * Math.PI * 2, Math.PI * 2 - 1e-3);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 14;
  ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + sweep); ctx.stroke();
  ctx.strokeStyle = CLAY;
  ctx.lineWidth = 6;
  ctx.beginPath(); ctx.arc(cx, cy, r - 22, -Math.PI / 2, -Math.PI / 2 + sweep); ctx.stroke();
  // spokes + crank, turning
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(spin);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 6;
  const n = 12;
  for (let i = 0; i < n; i++) {
    const k = clamp(d * n - i);
    if (k <= 0) continue;
    const a = (i / n) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 26, Math.sin(a) * 26);
    ctx.lineTo(Math.cos(a) * (26 + (r - 48) * k), Math.sin(a) * (26 + (r - 48) * k));
    ctx.stroke();
  }
  ctx.lineWidth = 10;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -r * 0.42); ctx.stroke();
  ctx.fillStyle = CLAY;
  ctx.beginPath(); ctx.arc(0, -r * 0.42, 14, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // hub
  ctx.fillStyle = INK;
  ctx.beginPath(); ctx.arc(cx, cy, 28, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = SAFFRON;
  ctx.beginPath(); ctx.arc(cx, cy, 12, 0, Math.PI * 2); ctx.fill();
  // thread
  ctx.globalAlpha *= clamp(d * 2 - 1);
  ctx.strokeStyle = "rgba(28,23,20,0.55)";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(cx + r * 0.7, cy - r * 0.7);
  ctx.quadraticCurveTo(cx + r + 90, cy - 20, sx, sy + 10);
  ctx.moveTo(cx + r * 0.7, cy + r * 0.7);
  ctx.quadraticCurveTo(cx + r + 60, cy + r * 0.5, sx, sy + 10);
  ctx.stroke();
  ctx.restore();
}

/** Gentle saffron/green motes drifting up. */
function motes(ctx: CanvasRenderingContext2D, t: number) {
  ctx.save();
  for (let i = 0; i < 26; i++) {
    const seed = i * 97.13;
    const x = ((seed * 7.7) % W) + Math.sin(t * 0.6 + i) * 30;
    const y = H - ((t * (30 + (i % 5) * 12) + seed * 13) % (H + 200));
    const r = 4 + (i % 4) * 2.5;
    ctx.globalAlpha = 0.18 + 0.12 * Math.sin(t * 2 + i);
    ctx.fillStyle = i % 3 === 0 ? GREEN : SAFFRON;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function valuePill(ctx: CanvasRenderingContext2D, s: string, y: number, p: number, color: string) {
  if (p <= 0) return;
  const k = easeOutBack(clamp(p));
  ctx.save();
  ctx.globalAlpha *= clamp(p * 2);
  ctx.translate(W / 2, y);
  ctx.scale(k, k);
  ctx.font = `700 64px ${SORA}`;
  const w = ctx.measureText(s).width + 120, h = 118;
  ctx.shadowColor = "rgba(24,20,16,0.14)";
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, -w / 2, -h / 2, w, h, h / 2);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(-w / 2 + 48, 0, 12, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = INK;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(s, 14, 2);
  ctx.restore();
}

/** When `word` is spoken within line `i`, estimated from its position in the line. */
function wordAt(tl: GreetingTimeline, i: number, word: string) {
  const line = GANDHI_LINES[i];
  const [s, e] = tl.segs[i];
  const at = Math.max(0, line.toLowerCase().indexOf(word.toLowerCase()));
  return s + (e - s) * (at / line.length);
}

export function renderGandhiJayanti(ctx: CanvasRenderingContext2D, kit: NooshoKit, t: number, tl: GreetingTimeline) {
  setFrameTime(t);
  drawBackdrop(ctx, t);
  const sun = ctx.createRadialGradient(W / 2, -120, 0, W / 2, -120, 1100);
  sun.addColorStop(0, "rgba(255,153,51,0.20)");
  sun.addColorStop(1, "rgba(255,153,51,0)");
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, W, H);
  motes(ctx, t);

  // Scene i starts just before line i; scene 3 covers lines 3 and 4.
  const lead = (i: number) => Math.max(0, tl.segs[i][0] - 0.3);
  const s1 = 0, s2 = lead(1), s3 = lead(2), s4 = lead(4);

  // 1 · Namaste
  let a = windowAlpha(t, s1, s2 - 0.15);
  if (a > 0) {
    ctx.save();
    ctx.globalAlpha = a;
    kicker(ctx, "2 October", 380, (t - 0.2) / 0.5);
    text(ctx, "Namaste!", W / 2, 540, 120, INK, (t - wordAt(tl, 0, "Namaste") + 0.15) / 0.5);
    const rise = easeOutBack(clamp(t / 0.6));
    drawNoosho(ctx, kit, "wave", W / 2, lerp(H + 760, 1480, rise), 720, { t, bob: 6 });
    ctx.restore();
  }

  // 2 · Happy Gandhi Jayanti + charkha
  a = windowAlpha(t, s2, s3 - 0.15);
  if (a > 0) {
    const lt = t - s2;
    const named = wordAt(tl, 1, "Gandhi");
    ctx.save();
    ctx.globalAlpha = a;
    charkha(ctx, W / 2 - 110, 560, 230, clamp(lt / 1.4), lt * 0.9);
    text(ctx, "Happy", W / 2, 1010, 92, INK, (t - named + 0.3) / 0.5, 600);
    text(ctx, "Gandhi Jayanti", W / 2, 1120, 104, CLAY, (t - named + 0.1) / 0.5);
    ribbon(ctx, 1200, 560, clamp((t - named - 0.2) / 0.7));
    const cheer = t > named;
    drawNoosho(ctx, kit, cheer ? "celebrate" : "idle", W / 2, 1640, 380, {
      t, bob: 4, jump: cheer ? Math.abs(Math.sin((t - named) * 5)) * 26 : 0,
    });
    ctx.restore();
  }

  // 3 · Remembering Bapu — each value pops as she says it
  a = windowAlpha(t, s3, s4 - 0.15);
  if (a > 0) {
    const lt = t - s3;
    ctx.save();
    ctx.globalAlpha = a;
    kicker(ctx, "Remembering Bapu", 330, lt / 0.5);
    valuePill(ctx, "Truth", 520, (t - wordAt(tl, 2, "truth") + 0.1) / 0.4, SAFFRON);
    valuePill(ctx, "Simplicity", 680, (t - wordAt(tl, 2, "simplicity") + 0.1) / 0.4, CLAY);
    valuePill(ctx, "Kindness", 840, (t - wordAt(tl, 2, "kindness") + 0.1) / 0.4, GREEN);
    const home = tl.segs[3][0];
    text(ctx, "A simple home", W / 2, 1040, 70, INK, (t - home) / 0.5, 600);
    text(ctx, "is a happy home.", W / 2, 1130, 70, CLAY, (t - wordAt(tl, 3, "is a happy")) / 0.5, 700);
    drawNoosho(ctx, kit, "idea", W / 2, 1640, 380, { t, bob: 5 });
    ctx.restore();
  }

  // 4 · Outro — the wish, the brand, Noosho waving
  a = windowAlpha(t, s4, tl.duration + 1);
  if (a > 0) {
    const lt = t - s4;
    ctx.save();
    ctx.globalAlpha = a;
    drawLockup(ctx, 420, 120, clamp(lt / 0.7), clamp((lt - 0.3) / 0.6));
    text(ctx, "Wishing you a peaceful", W / 2, 600, 58, INK, (lt - 0.4) / 0.5, 600);
    text(ctx, "Gandhi Jayanti", W / 2, 680, 70, CLAY, (lt - 0.55) / 0.5, 700);
    ribbon(ctx, 745, 360, clamp((lt - 0.8) / 0.6));
    const p = easeOutBack(clamp((lt - 1.0) / 0.4));
    if (p > 0) {
      ctx.save();
      ctx.globalAlpha *= clamp(p);
      ctx.translate(W / 2, 870);
      ctx.scale(p, p);
      ctx.font = `600 44px ${SORA}`;
      const w = ctx.measureText("noosho.com").width + 70, h = 88;
      ctx.fillStyle = CLAY;
      roundRect(ctx, -w / 2, -h / 2, w, h, h / 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("noosho.com", 0, 2);
      ctx.restore();
    }
    // waits for scene 3's Noosho to fade, so there's never two of her
    const rise = easeOutBack(clamp((lt - 0.4) / 0.5));
    drawNoosho(ctx, kit, "wave", W / 2, lerp(H + 700, 1560, rise), 620, { t, bob: 8 });
    ctx.restore();
  }
}
