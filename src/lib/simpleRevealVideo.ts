import { Muxer, ArrayBufferTarget } from "mp4-muxer";
import { isRevealVideoSupported, type RevealVideoInput } from "./revealVideo";
import { loadOutroClip, appendOutro } from "./outroClip";

// The original "before → after" reveal: a simple horizontal wipe with a drag
// handle, Before/After pills, and a noosho watermark. No logo intro, phone
// mockup, or shop scenes — just the two photos. Kept alongside the branded
// commercial (revealVideo.ts) as a lighter export option. 9:16, 1080×1920.

const W = 1080;
const H = 1920;
const FPS = 30;

const HOLD_BEFORE = 24; // ~0.8s
const WIPE = 90; // ~3.0s
// Was 42 (~1.4s), which is long enough to admire the result but not to READ a
// price and a call to action. The offer caption lands in this beat, so the hold
// has to cover a fade-in plus dwell time on two lines.
const HOLD_AFTER = 96; // ~3.2s
const TOTAL = HOLD_BEFORE + WIPE + HOLD_AFTER;
/** Fade the offer caption in over this many frames once the wipe finishes. */
const OFFER_FADE = 12; // ~0.4s

export const SIMPLE_REVEAL_DURATION = TOTAL / FPS;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

function smoothstep(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

type Rect = { x: number; y: number; w: number; h: number };

function containRect(iw: number, ih: number, bw: number, bh: number): Rect {
  const scale = Math.min(bw / iw, bh / ih);
  const w = iw * scale;
  const h = ih * scale;
  return { x: (bw - w) / 2, y: (bh - h) / 2, w, h };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawPill(
  ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, bg: string, fg: string
) {
  ctx.font = "600 26px Sora, system-ui, sans-serif";
  const padX = 20;
  const tw = ctx.measureText(text).width;
  const w = tw + padX * 2;
  const h = 46;
  roundRect(ctx, cx - w / 2, cy - h / 2, w, h, h / 2);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, cx, cy + 1);
}

function drawWatermark(ctx: CanvasRenderingContext2D) {
  const cx = W / 2;
  const cy = H - 130;
  ctx.save();
  ctx.font = "600 50px Sora, system-ui, sans-serif";
  const label = "noosho";
  const tw = ctx.measureText(label).width;
  const ringR = 21; // ring radius
  const ringGap = 27; // center-to-center of the twin rings
  const markW = ringR * 2 + ringGap; // total mark width
  const gap = 20; // mark → wordmark
  const padX = 38;
  const totalW = markW + gap + tw + padX * 2;
  const h = 94;
  roundRect(ctx, cx - totalW / 2, cy - h / 2, totalW, h, h / 2);
  ctx.fillStyle = "rgba(24,20,16,0.78)";
  ctx.fill();
  const rx = cx - totalW / 2 + padX + ringR;
  const ry = cy;
  ctx.lineWidth = 7;
  ctx.strokeStyle = "#faf6f0";
  ctx.beginPath();
  ctx.arc(rx, ry, ringR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "#bd6a43";
  ctx.beginPath();
  ctx.arc(rx + ringGap, ry, ringR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#faf6f0";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(label, rx + ringGap + ringR + gap, cy + 2);
  ctx.restore();
}

export interface OfferCaption {
  priceLine?: string;
  ctaLine?: string;
}

/**
 * Largest font size (down to `min`) at which `text` fits `maxW`.
 *
 * Canvas `fillText`'s own maxWidth argument condenses the glyphs instead of
 * wrapping or shrinking, so an Indian lakh-scale total — "Buy everything from
 * ₹1,24,999" measures 962px against a 960px limit at 62px — renders visibly
 * squashed. Stepping the size down keeps the letterforms honest.
 */
function fitSize(
  ctx: CanvasRenderingContext2D,
  text: string | undefined,
  weight: number,
  start: number,
  min: number,
  maxW: number
): number {
  if (!text) return start;
  let size = start;
  while (size > min) {
    ctx.font = `${weight} ${size}px Sora, system-ui, sans-serif`;
    if (ctx.measureText(text).width <= maxW) break;
    size -= 2;
  }
  return size;
}

/**
 * The engagement caption: basket price above, comment prompt below, sitting
 * just over the watermark.
 *
 * Drawn on its own scrim rather than straight onto the frame. A landscape photo
 * leaves wide letterbox bands where bare text would read fine, but a portrait
 * one fills almost the whole 9:16 frame and the text would land on the design
 * itself — unreadable over a busy backdrop, and it would cover the very thing
 * the video is selling.
 */
function drawOffer(
  ctx: CanvasRenderingContext2D,
  offer: OfferCaption,
  alpha: number
) {
  const price = offer.priceLine?.trim();
  const cta = offer.ctaLine?.trim();
  if (alpha <= 0 || (!price && !cta)) return;

  const MAX_W = W - 120;
  const priceSize = fitSize(ctx, price, 700, 62, 40, MAX_W);
  const ctaSize = fitSize(ctx, cta, 600, 38, 26, MAX_W);
  const gap = price && cta ? 22 : 0;
  const blockH = (price ? priceSize : 0) + gap + (cta ? ctaSize : 0);

  // Sit above the watermark (centred on H-130, 94 tall) with breathing room.
  const bottom = H - 130 - 47 - 34;
  const top = bottom - blockH - 56;

  ctx.save();
  ctx.globalAlpha = alpha;

  // Gradient scrim, transparent at the top so it never reads as a hard band.
  const g = ctx.createLinearGradient(0, top - 90, 0, bottom + 56);
  g.addColorStop(0, "rgba(23,19,16,0)");
  g.addColorStop(0.45, "rgba(23,19,16,0.82)");
  g.addColorStop(1, "rgba(23,19,16,0.92)");
  ctx.fillStyle = g;
  ctx.fillRect(0, top - 90, W, bottom + 56 - (top - 90));

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  let y = top + 28;

  if (price) {
    ctx.font = `700 ${priceSize}px Sora, system-ui, sans-serif`;
    ctx.fillStyle = "#faf6f0";
    ctx.fillText(price, W / 2, y, W - 120);
    y += priceSize + gap;
  }
  if (cta) {
    ctx.font = `600 ${ctaSize}px Sora, system-ui, sans-serif`;
    ctx.fillStyle = "#e8b9a2"; // light clay — reads as the actionable line
    ctx.fillText(cta, W / 2, y, W - 120);
  }
  ctx.restore();
}

/** Composite one before→after wipe frame. `revealX` = fraction [0..1] of the
 *  rect still showing "before" from the left. Exposed for visual verification. */
export function renderSimpleRevealFrame(
  ctx: CanvasRenderingContext2D,
  before: HTMLImageElement,
  after: HTMLImageElement,
  rect: Rect,
  revealX: number,
  offer?: OfferCaption,
  offerAlpha = 0
) {
  // 1. Solid neutral backdrop — never the design, so the letterbox bands above
  //    and below the photo stay clean and never expose the final design.
  ctx.fillStyle = "#171310";
  ctx.fillRect(0, 0, W, H);

  // 2. Foreground = after, contain-fit.
  ctx.drawImage(after, rect.x, rect.y, rect.w, rect.h);

  // 3. Before clipped to the left reveal portion.
  const splitW = rect.w * revealX;
  if (splitW > 0.5) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, splitW, rect.h);
    ctx.clip();
    ctx.drawImage(before, rect.x, rect.y, rect.w, rect.h);
    ctx.restore();
  }

  // 4. Handle line + grip while wiping.
  if (revealX > 0.001 && revealX < 0.999) {
    const hx = rect.x + splitW;
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(hx, rect.y);
    ctx.lineTo(hx, rect.y + rect.h);
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(hx, rect.y + rect.h / 2, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#a04525";
    ctx.font = "700 26px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("‹ ›", hx, rect.y + rect.h / 2 + 1);
    ctx.restore();
  }

  // 5. Before / After pills.
  const pillY = rect.y + 36;
  if (revealX > 0.05) {
    drawPill(ctx, "Before", rect.x + 70, pillY, "rgba(255,255,255,0.92)", "#1c1917");
  }
  drawPill(ctx, "After", rect.x + rect.w - 60, pillY, "#a04525", "#ffffff");

  // 6. Offer caption — before the watermark so the scrim can't cover it.
  if (offer) drawOffer(ctx, offer, offerAlpha);

  // 7. Brand watermark.
  drawWatermark(ctx);
}

/** Render the original before→after wipe as a 9:16 H.264 MP4, entirely in-browser. */
export async function generateSimpleRevealVideo(
  { beforeUrl, afterUrl, outro = true, offer }: RevealVideoInput,
  onProgress?: (fraction: number) => void
): Promise<Blob> {
  if (!isRevealVideoSupported()) {
    throw new Error("Video export needs a Chromium browser (Chrome or Edge).");
  }

  const [before, after, outroClip] = await Promise.all([
    loadImage(beforeUrl),
    loadImage(afterUrl),
    outro ? loadOutroClip() : Promise.resolve(null),
  ]);
  const ALL_FRAMES = TOTAL + (outroClip?.frameCount ?? 0);

  // Ensure the Sora wordmark is available so the watermark renders in-brand.
  try { if (document.fonts?.ready) await document.fonts.ready; } catch { /* non-fatal */ }

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Could not get a 2D canvas context.");

  // Both images share one contain rect so the wipe lines up.
  const rect = containRect(after.width, after.height, W, H);

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: "avc", width: W, height: H },
    fastStart: "in-memory",
  });

  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      throw e;
    },
  });

  const config: VideoEncoderConfig = {
    codec: "avc1.42E029", // H.264 baseline, level 4.1 (handles 1080×1920)
    width: W,
    height: H,
    bitrate: 6_000_000,
    framerate: FPS,
  };
  const support = await VideoEncoder.isConfigSupported(config);
  if (!support.supported) {
    config.codec = "avc1.4D4029"; // fall back to Main profile
  }
  encoder.configure(config);

  const frameDur = 1_000_000 / FPS; // microseconds
  for (let i = 0; i < TOTAL; i++) {
    let revealX = 1;
    if (i >= HOLD_BEFORE && i < HOLD_BEFORE + WIPE) {
      revealX = 1 - smoothstep((i - HOLD_BEFORE) / WIPE);
    } else if (i >= HOLD_BEFORE + WIPE) {
      revealX = 0;
    }

    // Fade the caption in only once the design is fully revealed, so it never
    // sits over the "before" photo or competes with the wipe.
    const wipeEnd = HOLD_BEFORE + WIPE;
    const offerAlpha =
      i < wipeEnd ? 0 : smoothstep((i - wipeEnd) / OFFER_FADE);

    renderSimpleRevealFrame(ctx, before, after, rect, revealX, offer, offerAlpha);

    const frame = new VideoFrame(canvas, {
      timestamp: Math.round(i * frameDur),
      duration: Math.round(frameDur),
    });
    encoder.encode(frame, { keyFrame: i % FPS === 0 });
    frame.close();

    if (onProgress) onProgress((i + 1) / ALL_FRAMES);

    // Relieve backpressure so the UI stays responsive.
    if (encoder.encodeQueueSize > 8) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  if (outroClip) {
    try {
      await appendOutro({
        encoder,
        ctx,
        canvas,
        clip: outroClip,
        startIndex: TOTAL,
        fps: FPS,
        onFrame: (abs) => onProgress?.((abs + 1) / ALL_FRAMES),
      });
    } finally {
      outroClip.dispose();
    }
  }

  await encoder.flush();
  muxer.finalize();
  encoder.close();

  const { buffer } = muxer.target as ArrayBufferTarget;
  return new Blob([buffer], { type: "video/mp4" });
}
