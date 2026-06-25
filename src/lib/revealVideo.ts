import { Muxer, ArrayBufferTarget } from "mp4-muxer";

// Vertical 9:16 social format.
const W = 1080;
const H = 1920;
const FPS = 30;

const HOLD_BEFORE = 24; // ~0.8s
const WIPE = 90; // ~3.0s
const HOLD_AFTER = 42; // ~1.4s
const TOTAL = HOLD_BEFORE + WIPE + HOLD_AFTER;

export function isRevealVideoSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof (window as unknown as { VideoEncoder?: unknown }).VideoEncoder !==
      "undefined" &&
    typeof (window as unknown as { VideoFrame?: unknown }).VideoFrame !==
      "undefined"
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

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  bw: number,
  bh: number
) {
  const scale = Math.max(bw / img.width, bh / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, (bw - w) / 2, (bh - h) / 2, w, h);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawPill(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  bg: string,
  fg: string
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
  const cy = H - 90;
  ctx.save();
  // pill background
  ctx.font = "600 34px Sora, system-ui, sans-serif";
  const label = "noosho";
  const tw = ctx.measureText(label).width;
  const ringW = 54;
  const gap = 14;
  const padX = 26;
  const totalW = ringW + gap + tw + padX * 2;
  const h = 64;
  roundRect(ctx, cx - totalW / 2, cy - h / 2, totalW, h, h / 2);
  ctx.fillStyle = "rgba(24,20,16,0.78)";
  ctx.fill();
  // twin rings
  const rx = cx - totalW / 2 + padX + 16;
  const ry = cy;
  ctx.lineWidth = 5;
  ctx.strokeStyle = "#faf6f0";
  ctx.beginPath();
  ctx.arc(rx, ry, 14, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "#bd6a43";
  ctx.beginPath();
  ctx.arc(rx + 18, ry, 14, 0, Math.PI * 2);
  ctx.stroke();
  // wordmark
  ctx.fillStyle = "#faf6f0";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(label, rx + 18 + 14 + gap, cy + 2);
  ctx.restore();
}

function renderFrame(
  ctx: CanvasRenderingContext2D,
  before: HTMLImageElement,
  after: HTMLImageElement,
  rect: Rect,
  revealX: number // fraction [0..1] of the rect still showing "before" from left
) {
  // 1. Blurred cover backdrop from the design (after), dimmed for contrast.
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  ctx.filter = "blur(36px)";
  drawCover(ctx, after, W, H);
  ctx.filter = "none";
  ctx.fillStyle = "rgba(24,20,16,0.40)";
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

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
  drawPill(
    ctx,
    "After",
    rect.x + rect.w - 60,
    pillY,
    "#a04525",
    "#ffffff"
  );

  // 6. Brand watermark.
  drawWatermark(ctx);
}

export interface RevealVideoInput {
  beforeUrl: string;
  afterUrl: string;
}

/** Render the before→after wipe as a 9:16 H.264 MP4, entirely in-browser. */
export async function generateRevealVideo(
  { beforeUrl, afterUrl }: RevealVideoInput,
  onProgress?: (fraction: number) => void
): Promise<Blob> {
  if (!isRevealVideoSupported()) {
    throw new Error("Video export needs a Chromium browser (Chrome or Edge).");
  }

  const [before, after] = await Promise.all([
    loadImage(beforeUrl),
    loadImage(afterUrl),
  ]);

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

    renderFrame(ctx, before, after, rect, revealX);

    const frame = new VideoFrame(canvas, {
      timestamp: Math.round(i * frameDur),
      duration: Math.round(frameDur),
    });
    encoder.encode(frame, { keyFrame: i % FPS === 0 });
    frame.close();

    if (onProgress) onProgress((i + 1) / TOTAL);

    // Relieve backpressure so the UI stays responsive.
    if (encoder.encodeQueueSize > 8) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  await encoder.flush();
  muxer.finalize();
  encoder.close();

  const { buffer } = muxer.target as ArrayBufferTarget;
  return new Blob([buffer], { type: "video/mp4" });
}
