import { Muxer, ArrayBufferTarget } from "mp4-muxer";

// Reveal MP4 export — a faithful port of the "Noosho Commercial" concept into
// Canvas2D + WebCodecs, per-design (its own before/after + products):
//   logo intro → phone (upload → pick a style) → scan-line transform →
//   shoppable pins + product cards → logo + noosho.com outro.
// Locked to 1080×1920 so the commercial's exact composition/coordinates apply.
// Photos are shown whole (contain) over a blurred backdrop so non-9:16 rooms
// are never cropped. The rooms/parties montage is intentionally omitted.

export type RevealAspect = "original" | "1:1" | "4:5" | "9:16";

const FPS = 30;
const W = 1080, H = 1920;

// Scene timeline (seconds) — ported from noosho-ad.jsx, montage removed, CTA pulled in.
const T_INTRO_END = 4.0;
const T_PHONE = [4.0, 13.3] as const;
const T_TRANSFORM = [13.0, 19.1] as const;
const T_SHOP = [18.9, 24.1] as const;
const T_CTA = [24.0, 26.9] as const;
const DURATION = 26.9;

// Big image card (transform + shop) and phone, in 1080×1920 space.
const CARD = { x: 60, y: 196, w: 960, h: 1280, rad: 40 };
const PH = { x: 250, y: 250, w: 580, h: 1130, pad: 16, rad: 64 };

// Brand system
const BG = "#faf7f3";
const INK = "#1c1714";
const CLAY = "#a04525";
const CLAY_BR = "#ce6533";
const CLAY_LT = "#e89b6b";
const CLAY_DP = "#7a3620";
const CREAM = "#f7f3ee";
const TINT = "#fcf3ed";
const TINT2 = "#f7decb";
const LINE = "#e9e2d8";
const SORA = "Sora, system-ui, sans-serif";
const UI = "Geist, system-ui, sans-serif";
const MONO = '"Geist Mono", ui-monospace, monospace';

// Easing
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeOutCubic = (t: number) => 1 - Math.pow(1 - clamp(t), 3);
const easeInOutCubic = (t: number) =>
  clamp(t) < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * clamp(t) + 2, 3) / 2;
const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * clamp(t)));
const easeInOutSine = (t: number) => -(Math.cos(Math.PI * clamp(t)) - 1) / 2;
const easeOutBack = (t: number) => {
  const c1 = 1.70158, c3 = c1 + 1, x = clamp(t);
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

export function isRevealVideoSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof (window as unknown as { VideoEncoder?: unknown }).VideoEncoder !== "undefined" &&
    typeof (window as unknown as { VideoFrame?: unknown }).VideoFrame !== "undefined"
  );
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

async function pickCodec(): Promise<string> {
  const VideoEncoder = (window as unknown as { VideoEncoder: typeof globalThis.VideoEncoder })
    .VideoEncoder;
  for (const codec of ["avc1.640034", "avc1.4d0034", "avc1.420034", "avc1.42E01F"]) {
    try {
      const { supported } = await VideoEncoder.isConfigSupported({
        codec, width: W, height: H, bitrate: 6_000_000, framerate: FPS,
      });
      if (supported) return codec;
    } catch { /* next */ }
  }
  return "avc1.42E01F";
}

// ── Geometry helpers ─────────────────────────────────────────────────────────
type Rect = { x: number; y: number; w: number; h: number };

function fitContain(img: HTMLImageElement, x: number, y: number, w: number, h: number): Rect {
  const r = Math.min(w / img.width, h / img.height);
  const dw = img.width * r, dh = img.height * r;
  return { x: x + (w - dw) / 2, y: y + (h - dh) / 2, w: dw, h: dh };
}

function drawCover(
  ctx: CanvasRenderingContext2D, img: HTMLImageElement,
  x: number, y: number, w: number, h: number, scale = 1
) {
  const r = Math.max(w / img.width, h / img.height) * scale;
  const dw = img.width * r, dh = img.height * r;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
      if (lines.length === maxLines - 1) break;
    } else line = test;
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length === maxLines) {
    let last = lines[maxLines - 1];
    while (ctx.measureText(`${last}…`).width > maxWidth && last.length > 1) last = last.slice(0, -1);
    lines[maxLines - 1] = `${last}…`;
  }
  return lines;
}

/** Paints an image's card content — blurred cover backdrop + the whole photo
 *  (contain) on top — into rect `c`. Assumes any rounded/scan clipping is
 *  already applied by the caller. Returns the contained image rect. */
function paintCardImage(
  ctx: CanvasRenderingContext2D, img: HTMLImageElement,
  c: { x: number; y: number; w: number; h: number }
): Rect {
  ctx.fillStyle = "#171310";
  ctx.fillRect(c.x, c.y, c.w, c.h);
  ctx.save();
  ctx.filter = "blur(30px)";
  ctx.globalAlpha = 0.6;
  drawCover(ctx, img, c.x - 30, c.y - 30, c.w + 60, c.h + 60, 1.1);
  ctx.restore();
  const r = fitContain(img, c.x, c.y, c.w, c.h);
  ctx.drawImage(img, r.x, r.y, r.w, r.h);
  return r;
}

/** Rounded image card: blurred cover backdrop + the whole photo (contain) on top.
 *  Returns the contained image rect (for scan line / hotspot mapping). */
function drawImageCard(
  ctx: CanvasRenderingContext2D, img: HTMLImageElement,
  c: { x: number; y: number; w: number; h: number; rad: number }
): Rect {
  ctx.save();
  roundRect(ctx, c.x, c.y, c.w, c.h, c.rad);
  ctx.clip();
  const r = paintCardImage(ctx, img, c);
  ctx.restore();
  return r;
}

// ── Brand drawables ─────────────────────────────────────────────────────────
function drawTwinRings(ctx: CanvasRenderingContext2D, leftX: number, cy: number, height: number, draw: number, swVB = 4) {
  const scale = height / 28, r = 11 * scale, sw = swVB * scale;
  const c1x = leftX + (13 - 2) * scale, c2x = leftX + (27 - 2) * scale;
  const start = -Math.PI / 2, sweep = clamp(draw) * Math.PI * 2;
  ctx.save();
  ctx.lineWidth = sw;
  ctx.lineCap = "round";
  ctx.strokeStyle = INK;
  ctx.beginPath(); ctx.arc(c1x, cy, r, start, start + sweep); ctx.stroke();
  ctx.strokeStyle = CLAY;
  ctx.beginPath(); ctx.arc(c2x, cy, r, start, start + sweep); ctx.stroke();
  ctx.restore();
  return (40 - 4) * scale;
}

function drawLockup(ctx: CanvasRenderingContext2D, cy: number, markH: number, draw: number, reveal: number, scale = 1) {
  const wordSize = markH * 0.86;
  ctx.save();
  ctx.font = `600 ${wordSize}px ${SORA}`;
  const wordW = ctx.measureText("noosho").width;
  const markW = (40 - 4) * (markH / 28);
  const gap = markH * 0.3;
  const totalW = (markW + gap + wordW) * scale;
  const startX = (W - totalW) / 2;
  ctx.translate(W / 2, cy); ctx.scale(scale, scale); ctx.translate(-W / 2, -cy);
  drawTwinRings(ctx, startX, cy, markH, draw);
  // wordmark with clip reveal
  const wx = startX + markW + gap;
  ctx.font = `600 ${wordSize}px ${SORA}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.beginPath();
  ctx.rect(wx, cy - wordSize, wordW * clamp(reveal) + 2, wordSize * 2);
  ctx.clip();
  ctx.fillStyle = INK;
  ctx.fillText("noosho", wx, cy + wordSize * 0.02);
  ctx.restore();
}

function drawWords(
  ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, size: number,
  lt: number, start: number, color: string, accent?: string, accentColor = CLAY, weight = 700
) {
  ctx.save();
  ctx.font = `${weight} ${size}px ${SORA}`;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  const space = size * 0.26; // generous word gap so words read as separate words
  const words = text.split(" ");
  const widths = words.map((w) => ctx.measureText(w).width);
  const total = widths.reduce((a, b) => a + b, 0) + space * (words.length - 1);
  let x = cx - total / 2;
  words.forEach((w, i) => {
    const p = easeOutExpo(clamp((lt - (start + i * 0.075)) / 0.55));
    const isAcc = accent && w.replace(/[.,—]/g, "").toLowerCase() === accent;
    ctx.globalAlpha = p;
    ctx.fillStyle = isAcc ? accentColor : color;
    ctx.fillText(w, x, y + (1 - p) * 28);
    x += widths[i] + space;
  });
  ctx.restore();
}

function drawKicker(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, size: number, p: number, color = CLAY) {
  ctx.save();
  ctx.globalAlpha = clamp(p);
  ctx.font = `500 ${size}px ${MONO}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  const label = text.toUpperCase();
  const ls = size * 0.3;
  const textW = [...label].reduce((a, c) => a + ctx.measureText(c).width + ls, 0);
  const ruleW = size * 1.3, gap = size * 0.6;
  let x = cx - (ruleW + gap + textW) / 2;
  ctx.fillStyle = color;
  ctx.fillRect(x, y - 1, ruleW, 2);
  x += ruleW + gap;
  for (const ch of label) { ctx.fillText(ch, x, y); x += ctx.measureText(ch).width + ls; }
  ctx.restore();
}

function drawScrim(ctx: CanvasRenderingContext2D) {
  const g = ctx.createLinearGradient(0, H, 0, H - 820);
  g.addColorStop(0, "rgba(20,15,11,0.82)");
  g.addColorStop(0.4, "rgba(20,15,11,0.42)");
  g.addColorStop(1, "rgba(20,15,11,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, H - 820, W, 820);
}

function drawBackdrop(ctx: CanvasRenderingContext2D, t: number) {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);
  const dx = Math.sin(t * 0.25) * 0.06 * W, dy = Math.cos(t * 0.2) * 0.05 * H;
  const g1 = ctx.createRadialGradient(0.72 * W + dx, 0.18 * H + dy, 0, 0.72 * W + dx, 0.18 * H + dy, 0.5 * W);
  g1.addColorStop(0, "rgba(160,69,37,0.10)"); g1.addColorStop(1, "rgba(160,69,37,0)");
  ctx.fillStyle = g1; ctx.fillRect(0, 0, W, H);
  const g2 = ctx.createRadialGradient(0.16 * W - dx, 0.84 * H - dy, 0, 0.16 * W - dx, 0.84 * H - dy, 0.5 * W);
  g2.addColorStop(0, "rgba(206,101,51,0.09)"); g2.addColorStop(1, "rgba(206,101,51,0)");
  ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H);
}

function sceneAlpha(t: number, start: number, end: number, inDur = 0.5, outDur = 0.5): number {
  if (t < start - 0.02 || t > end + 0.02) return 0;
  let o = 1;
  if (t < start + inDur) o = clamp((t - start) / inDur);
  else if (t > end - outDur) o = clamp((end - t) / outDur);
  return easeInOutCubic(o);
}

// ── Scenes ──────────────────────────────────────────────────────────────────

function sceneIntro(ctx: CanvasRenderingContext2D, t: number) {
  const a = sceneAlpha(t, 0, T_INTRO_END, 0.01, 0.5);
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha = a;
  const draw = easeInOutCubic(clamp((t - 0.4) / 1.0));
  const reveal = easeOutExpo(clamp((t - 1.2) / 0.7));
  const markScale = 0.7 + easeOutBack(clamp((t - 0.2) / 1.0)) * 0.3;
  drawLockup(ctx, H * 0.36, 120, draw, reveal, markScale);
  // Three lines, matching the commercial: "Redesign any" / "room." / "Then shop it."
  const size = 104, lh = 122, y0 = H * 0.5;
  drawWords(ctx, "Redesign any", W / 2, y0, size, t, 2.0, INK);
  drawWords(ctx, "room.", W / 2, y0 + lh, size, t, 2.3, INK);
  drawWords(ctx, "Then shop it.", W / 2, y0 + lh * 2, size, t, 2.6, INK, "shop", CLAY);
  ctx.restore();
}

function appHeader(ctx: CanvasRenderingContext2D, x: number, y: number, w: number) {
  drawTwinRings(ctx, x + 30, y + 48, 26, 1);
  ctx.fillStyle = INK;
  ctx.font = `600 27px ${SORA}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText("noosho", x + 30 + 50, y + 50);
  ctx.fillStyle = TINT;
  ctx.beginPath();
  ctx.arc(x + w - 30 - 19, y + 48, 19, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = TINT2; ctx.lineWidth = 1.5; ctx.stroke();
}

function ctaButton(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, label: string, p: number) {
  if (p <= 0) return;
  const s = lerp(0.9, 1, easeOutBack(p));
  ctx.save();
  ctx.globalAlpha = clamp(p);
  ctx.translate(x + w / 2, y + h / 2);
  ctx.scale(s, s);
  ctx.translate(-w / 2, -h / 2);
  ctx.fillStyle = CLAY;
  roundRect(ctx, 0, 0, w, h, 22);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = `600 28px ${UI}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, w / 2, h / 2 + 1);
  ctx.restore();
}

function scenePhone(ctx: CanvasRenderingContext2D, before: HTMLImageElement, t: number) {
  const a = sceneAlpha(t, T_PHONE[0], T_PHONE[1], 0.4, 0.3);
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha = a;

  const inP = easeOutCubic(clamp((t - 4.0) / 0.6));
  const ty = (1 - inP) * 60, sc = lerp(0.94, 1, inP);
  ctx.save();
  ctx.globalAlpha *= inP;
  ctx.translate(PH.x + PH.w / 2, PH.y + PH.h * 0.3);
  ctx.scale(sc, sc);
  ctx.translate(-(PH.x + PH.w / 2), -(PH.y + PH.h * 0.3) + ty);

  // phone body + screen
  ctx.fillStyle = "#171310";
  roundRect(ctx, PH.x, PH.y, PH.w, PH.h, PH.rad);
  ctx.fill();
  const ix = PH.x + PH.pad, iy = PH.y + PH.pad, iw = PH.w - PH.pad * 2, ih = PH.h - PH.pad * 2;
  ctx.save();
  roundRect(ctx, ix, iy, iw, ih, PH.rad - PH.pad);
  ctx.clip();
  ctx.fillStyle = "#fff";
  ctx.fillRect(ix, iy, iw, ih);

  const upOp = clamp((9.15 - t) / 0.35);
  const stOp = clamp((t - 8.85) / 0.35);

  // ── Upload screen ──
  if (upOp > 0) {
    ctx.save();
    ctx.globalAlpha = upOp;
    appHeader(ctx, ix, iy, iw);
    const padX = 26, top = iy + 100;
    ctx.fillStyle = CLAY;
    ctx.font = `500 16px ${MONO}`;
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.fillText("NEW DESIGN", ix + padX, top + 6);
    const dzY = top + 30, dzH = ih - (dzY - iy) - 120, dzX = ix + padX, dzW = iw - padX * 2;
    const drop = easeOutBack(clamp((t - 4.9) / 0.9));
    ctx.save();
    roundRect(ctx, dzX, dzY, dzW, dzH, 30);
    ctx.clip();
    if (drop < 0.1) {
      ctx.fillStyle = TINT; ctx.fillRect(dzX, dzY, dzW, dzH);
      const emptyOp = clamp(1 - (t - 4.8) / 0.3);
      ctx.globalAlpha = upOp * emptyOp;
      ctx.fillStyle = "#fff";
      roundRect(ctx, dzX + dzW / 2 - 36, dzY + dzH / 2 - 50, 72, 72, 22); ctx.fill();
      ctx.strokeStyle = CLAY; ctx.lineWidth = 4; ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(dzX + dzW / 2, dzY + dzH / 2 - 36); ctx.lineTo(dzX + dzW / 2, dzY + dzH / 2 + 4);
      ctx.moveTo(dzX + dzW / 2 - 20, dzY + dzH / 2 - 16); ctx.lineTo(dzX + dzW / 2 + 20, dzY + dzH / 2 - 16);
      ctx.stroke();
      ctx.fillStyle = CLAY_DP; ctx.font = `500 23px ${UI}`; ctx.textAlign = "center";
      ctx.fillText("Add a photo", dzX + dzW / 2, dzY + dzH / 2 + 56);
      ctx.globalAlpha = upOp;
    } else {
      ctx.fillStyle = "#000"; ctx.fillRect(dzX, dzY, dzW, dzH);
      const imgY = (1 - drop) * -90;
      ctx.globalAlpha = upOp * clamp((t - 4.9) / 0.4);
      drawCover(ctx, before, dzX, dzY + imgY, dzW, dzH);
      ctx.globalAlpha = upOp;
    }
    ctx.restore();
    ctaButton(ctx, dzX, iy + ih - 100, dzW, 84, "Continue", easeOutBack(clamp((t - 6.0) / 0.5)));
    ctx.restore();
  }

  // ── Style screen ──
  if (stOp > 0 && t > 8.6) {
    ctx.save();
    ctx.globalAlpha = stOp;
    appHeader(ctx, ix, iy, iw);
    const padX = 26, top = iy + 100, heroP = easeOutCubic(clamp((t - 9.0) / 0.5));
    const heroH = 300;
    ctx.save();
    ctx.globalAlpha = stOp * heroP;
    roundRect(ctx, ix + padX, top, iw - padX * 2, heroH, 26);
    ctx.clip();
    drawCover(ctx, before, ix + padX, top, iw - padX * 2, heroH);
    ctx.restore();
    const titleP = easeOutCubic(clamp((t - 9.3) / 0.5));
    ctx.globalAlpha = stOp * titleP;
    ctx.fillStyle = INK; ctx.font = `600 34px ${SORA}`; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.fillText("Choose your style", ix + padX, top + heroH + 56);
    ctx.globalAlpha = stOp;
    const styles = ["Modern", "Boho", "Scandi", "Japandi", "Coastal", "Minimal"];
    let cx = ix + padX, cy = top + heroH + 96;
    ctx.font = `500 24px ${UI}`;
    styles.forEach((s, i) => {
      const ap = easeOutBack(clamp((t - (9.6 + i * 0.08)) / 0.45));
      const cw = ctx.measureText(s).width + 48, chH = 54;
      if (cx + cw > ix + iw - padX) { cx = ix + padX; cy += chH + 13; }
      const sel = s === "Modern";
      const selP = sel ? easeOutBack(clamp((t - 10.7) / 0.4)) : 0;
      ctx.save();
      ctx.globalAlpha = stOp * ap;
      ctx.fillStyle = sel ? `rgba(160,69,37,${selP})` : "#fff";
      roundRect(ctx, cx, cy, cw, chH, 40); ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = sel && selP > 0.3 ? CLAY : LINE; ctx.stroke();
      ctx.fillStyle = sel && selP > 0.5 ? "#fff" : INK;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(s, cx + cw / 2, cy + chH / 2 + 1);
      ctx.restore();
      cx += cw + 13;
    });
    ctaButton(ctx, ix + padX, iy + ih - 100, iw - padX * 2, 84, "Generate design", easeOutBack(clamp((t - 11.3) / 0.5)));
    ctx.restore();
  }

  // notch
  ctx.fillStyle = "#171310";
  roundRect(ctx, ix + iw / 2 - 62, iy + 16, 124, 30, 18); ctx.fill();
  ctx.restore(); // screen clip
  ctx.restore(); // phone transform

  // captions below phone
  const capY = 1448;
  if (t < 9.2) {
    const o = clamp((9.0 - t) / 0.3);
    ctx.globalAlpha = a * o;
    drawKicker(ctx, "Step 01 · Upload", W / 2, capY, 25, clamp((t - 4.4) / 0.5));
    drawWords(ctx, "Upload one photo", W / 2, capY + 70, 74, t, 4.7, INK);
  } else {
    const o = clamp((t - 9.0) / 0.3);
    ctx.globalAlpha = a * o;
    drawKicker(ctx, "Step 02 · Style", W / 2, capY, 25, clamp((t - 9.2) / 0.5));
    drawWords(ctx, "Pick a style", W / 2, capY + 70, 74, t, 9.4, INK, "style", CLAY);
  }
  ctx.restore();
}

function sceneTransform(ctx: CanvasRenderingContext2D, before: HTMLImageElement, after: HTMLImageElement, t: number) {
  const a = sceneAlpha(t, T_TRANSFORM[0], T_TRANSFORM[1], 0.4, 0.4);
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha = a;
  const lt = t - T_TRANSFORM[0];
  const line = easeInOutSine(clamp((lt - 0.9) / 2.3)); // 0..1 within image
  const scanning = lt > 0.7 && line < 1;

  drawImageCard(ctx, after, CARD); // after base (fills the whole card)
  // The "before" fills the whole card the same way (its own backdrop + contained
  // photo), clipped below the scan line, so the letterbox bands never expose the
  // final design before the wipe reaches them. Scan sweeps the full card height.
  if (line < 1) {
    const cardBottom = CARD.y + CARD.h;
    const sy = CARD.y + line * CARD.h;
    ctx.save();
    roundRect(ctx, CARD.x, CARD.y, CARD.w, CARD.h, CARD.rad);
    ctx.clip();
    ctx.beginPath();
    ctx.rect(CARD.x, sy, CARD.w, cardBottom - sy);
    ctx.clip();
    paintCardImage(ctx, before, CARD);
    if (scanning) {
      ctx.fillStyle = "rgba(122,54,32,0.18)";
      ctx.fillRect(CARD.x, sy, CARD.w, cardBottom - sy);
      ctx.strokeStyle = "rgba(255,255,255,0.16)";
      ctx.lineWidth = 1;
      for (let gx = CARD.x; gx < CARD.x + CARD.w; gx += 46) { ctx.beginPath(); ctx.moveTo(gx, sy); ctx.lineTo(gx, cardBottom); ctx.stroke(); }
      for (let gy = Math.ceil(sy / 46) * 46; gy < cardBottom; gy += 46) { ctx.beginPath(); ctx.moveTo(CARD.x, gy); ctx.lineTo(CARD.x + CARD.w, gy); ctx.stroke(); }
    }
    ctx.restore();
    if (scanning) {
      const glow = ctx.createLinearGradient(0, sy - 200, 0, sy);
      glow.addColorStop(0, "rgba(206,101,51,0)"); glow.addColorStop(1, "rgba(206,101,51,0.55)");
      ctx.fillStyle = glow; ctx.fillRect(CARD.x, sy - 200, CARD.w, 200);
      ctx.fillStyle = CLAY_BR; ctx.fillRect(CARD.x, sy - 3, CARD.w, 6);
    }
  }

  // Designed badge
  const doneP = easeOutBack(clamp((lt - 3.4) / 0.5));
  if (doneP > 0.01) {
    ctx.save();
    ctx.globalAlpha = a * clamp(doneP);
    ctx.font = `600 24px ${UI}`;
    const label = "Designed", tw = ctx.measureText(label).width;
    const bx = CARD.x + 26, by = CARD.y + 26, bh = 52, bw = 22 + 28 + 12 + tw + 22;
    ctx.fillStyle = "rgba(255,255,255,0.92)"; roundRect(ctx, bx, by, bw, bh, bh / 2); ctx.fill();
    ctx.fillStyle = CLAY; ctx.beginPath(); ctx.arc(bx + 22 + 14, by + bh / 2, 14, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(bx + 22 + 8, by + bh / 2); ctx.lineTo(bx + 22 + 12, by + bh / 2 + 5); ctx.lineTo(bx + 22 + 20, by + bh / 2 - 5);
    ctx.stroke();
    ctx.fillStyle = INK; ctx.textBaseline = "middle"; ctx.textAlign = "left";
    ctx.fillText(label, bx + 22 + 28 + 12, by + bh / 2 + 1);
    ctx.restore();
  }

  drawScrim(ctx);
  drawKicker(ctx, "Step 03 · Transform", W / 2, H - 230, 25, clamp((lt - 0.4) / 0.5), CLAY_LT);
  drawWords(ctx, "Designed in seconds", W / 2, H - 150, 84, lt, 0.7, CREAM, "seconds", CLAY_LT);
  ctx.restore();
}

type ShopCard = { img: HTMLImageElement; title: string; price: string; x?: number; y?: number };

function sceneShop(ctx: CanvasRenderingContext2D, after: HTMLImageElement, cards: ShopCard[], t: number) {
  const a = sceneAlpha(t, T_SHOP[0], T_SHOP[1], 0.4, 0.4);
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha = a;
  const lt = t - T_SHOP[0];
  const rect = drawImageCard(ctx, after, CARD);

  // pins at hotspots
  cards.forEach((c, i) => {
    if (c.x == null || c.y == null) return;
    const at = 0.5 + i * 0.3;
    const pop = easeOutBack(clamp((lt - at) / 0.45));
    if (pop <= 0) return;
    const px = rect.x + (c.x / 100) * rect.w, py = rect.y + (c.y / 100) * rect.h;
    const pulse = 0.5 + 0.5 * Math.sin((lt - at) * 4);
    ctx.save();
    ctx.globalAlpha = a * 0.7 * (1 - pulse);
    ctx.strokeStyle = CLAY_BR; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(px, py, 26 * (1 + pulse * 0.8), 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(px, py, 16 * pop, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = CLAY; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(px, py, 16 * pop, 0, Math.PI * 2); ctx.stroke();
  });

  drawScrim(ctx);

  // product cards stacked above the caption
  const cardW = 620, cardH = 112, gap = 16, baseY = H - 360;
  cards.forEach((c, i) => {
    const p = easeOutCubic(clamp((lt - (0.8 + i * 0.2)) / 0.5));
    if (p <= 0) return;
    const x = 80, y = baseY - (cards.length - 1 - i) * (cardH + gap);
    ctx.save();
    ctx.globalAlpha = a * p;
    ctx.translate((1 - p) * 60, 0);
    ctx.fillStyle = "rgba(255,255,255,0.97)";
    roundRect(ctx, x, y, cardW, cardH, 26); ctx.fill();
    const th = 76, tx = x + 18, ty = y + (cardH - th) / 2;
    ctx.save(); roundRect(ctx, tx, ty, th, th, 18); ctx.clip(); drawCover(ctx, c.img, tx, ty, th, th); ctx.restore();
    const textX = tx + th + 20;
    ctx.fillStyle = CLAY; ctx.font = `500 14px ${MONO}`; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.fillText("SHOPPABLE", textX, y + 40);
    ctx.fillStyle = INK; ctx.font = `600 28px ${UI}`;
    const [ln] = wrapText(ctx, c.title, cardW - (textX - x) - 90, 1);
    ctx.fillText(ln, textX, y + 74);
    const bs = 56, bx = x + cardW - bs - 18, by = y + (cardH - bs) / 2;
    ctx.fillStyle = CLAY; roundRect(ctx, bx, by, bs, bs, 16); ctx.fill();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.arc(bx + bs * 0.4, by + bs * 0.72, 3, 0, Math.PI * 2);
    ctx.arc(bx + bs * 0.66, by + bs * 0.72, 3, 0, Math.PI * 2);
    ctx.moveTo(bx + bs * 0.22, by + bs * 0.26); ctx.lineTo(bx + bs * 0.32, by + bs * 0.26);
    ctx.lineTo(bx + bs * 0.44, by + bs * 0.6); ctx.lineTo(bx + bs * 0.74, by + bs * 0.6);
    ctx.stroke();
    ctx.restore();
  });

  drawKicker(ctx, "Step 04 · Shop", W / 2, H - 230, 25, clamp((lt - 0.3) / 0.5), CLAY_LT);
  drawWords(ctx, "Shop the exact look", W / 2, H - 150, 80, lt, 0.6, CREAM, "shop", CLAY_LT);
  ctx.restore();
}

function sceneCTA(ctx: CanvasRenderingContext2D, t: number) {
  const a = sceneAlpha(t, T_CTA[0], T_CTA[1], 0.35, 0.01);
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha = a;
  const lt = t - T_CTA[0];
  drawKicker(ctx, "No skills needed", W / 2, H * 0.34, 24, clamp((lt - 0.2) / 0.5));
  const draw = easeOutCubic(clamp((lt - 0.2) / 0.7));
  const reveal = easeOutExpo(clamp((lt - 0.5) / 0.6));
  const markScale = 0.8 + easeOutBack(clamp(lt / 0.8)) * 0.2;
  drawLockup(ctx, H * 0.44, 108, draw, reveal, markScale);
  drawWords(ctx, "Try noosho — free", W / 2, H * 0.56, 92, lt, 0.7, INK, "free", CLAY);
  const btnP = easeOutBack(clamp((lt - 1.3) / 0.5));
  if (btnP > 0.01) {
    ctx.save();
    ctx.globalAlpha = a * clamp(btnP);
    ctx.font = `600 38px ${UI}`;
    const label = "noosho.com", tw = ctx.measureText(label).width;
    const bw = tw + 104, bh = 84, bx = (W - bw) / 2, by = H * 0.62;
    ctx.fillStyle = CLAY; roundRect(ctx, bx, by, bw, bh, bh / 2); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(label, W / 2, by + bh / 2 + 1);
    ctx.restore();
  }
  ctx.restore();
}

function vignette(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.72);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(1, "rgba(40,22,12,0.90)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/** Composite one frame at time `t` (seconds). Exposed for visual verification. */
export function renderRevealFrame(
  ctx: CanvasRenderingContext2D,
  t: number,
  before: HTMLImageElement,
  after: HTMLImageElement,
  cards: ShopCard[]
) {
  drawBackdrop(ctx, t);
  sceneIntro(ctx, t);
  scenePhone(ctx, before, t);
  sceneTransform(ctx, before, after, t);
  sceneShop(ctx, after, cards, t);
  sceneCTA(ctx, t);
  vignette(ctx);
}

export const REVEAL_DURATION = DURATION;

// ── Public API ──────────────────────────────────────────────────────────────
export interface RevealProduct {
  imageUrl: string;
  title: string;
  price: string;
  x?: number;
  y?: number;
}

export interface RevealVideoInput {
  beforeUrl: string;
  afterUrl: string;
  aspect?: RevealAspect; // ignored — branded reveal is locked to 1080×1920
  products?: RevealProduct[];
}

/** Render the branded reveal commercial (1080×1920 H.264 MP4), in-browser. */
export async function generateRevealVideo(
  { beforeUrl, afterUrl, products = [] }: RevealVideoInput,
  onProgress?: (fraction: number) => void
): Promise<Blob> {
  if (!isRevealVideoSupported()) {
    throw new Error("Video export needs a Chromium browser (Chrome or Edge).");
  }

  const [before, after] = await Promise.all([loadImage(beforeUrl), loadImage(afterUrl)]);

  const cards = (
    await Promise.all(
      products.slice(0, 3).map(async (p): Promise<ShopCard | null> => {
        try {
          const img = await loadImage(p.imageUrl);
          return { img, title: p.title, price: p.price, x: p.x, y: p.y };
        } catch {
          return null;
        }
      })
    )
  ).filter((c): c is ShopCard => c !== null);

  try { if (document.fonts?.ready) await document.fonts.ready; } catch { /* non-fatal */ }

  const TOTAL = Math.round(DURATION * FPS);
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Could not get a 2D canvas context.");

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: "avc", width: W, height: H },
    fastStart: "in-memory",
  });
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { throw e; },
  });
  encoder.configure({ codec: await pickCodec(), width: W, height: H, bitrate: 6_000_000, framerate: FPS });

  const frameDur = 1_000_000 / FPS;
  for (let i = 0; i < TOTAL; i++) {
    const t = i / FPS;
    renderRevealFrame(ctx, t, before, after, cards);

    const frame = new VideoFrame(canvas, { timestamp: Math.round(i * frameDur), duration: Math.round(frameDur) });
    encoder.encode(frame, { keyFrame: i % FPS === 0 });
    frame.close();
    if (onProgress) onProgress((i + 1) / TOTAL);
    if (encoder.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 0));
  }

  await encoder.flush();
  muxer.finalize();
  encoder.close();
  const { buffer } = muxer.target as ArrayBufferTarget;
  return new Blob([buffer], { type: "video/mp4" });
}
