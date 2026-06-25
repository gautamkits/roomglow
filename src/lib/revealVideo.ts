import { Muxer, ArrayBufferTarget } from "mp4-muxer";

export type RevealAspect = "original" | "1:1" | "4:5" | "9:16";

const FPS = 30;
const HOLD_BEFORE = 24; // ~0.8s
const WIPE = 90; // ~3.0s
const HOLD_AFTER = 42; // ~1.4s
const TOTAL = HOLD_BEFORE + WIPE + HOLD_AFTER;
const MAX_SIDE = 1920; // clamp so we stay within H.264 level limits

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

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/** Output W×H (even, longest side ≤ MAX_SIDE) for the chosen aspect. */
function outputSize(
  aspect: RevealAspect,
  imgW: number,
  imgH: number
): { w: number; h: number } {
  let ratio: number; // width / height
  if (aspect === "1:1") ratio = 1;
  else if (aspect === "4:5") ratio = 4 / 5;
  else if (aspect === "9:16") ratio = 9 / 16;
  else ratio = imgW / imgH; // original

  if (aspect === "original") {
    // Never upscale — base on the source so frames stay within encoder limits.
    const scale = Math.min(1, MAX_SIDE / Math.max(imgW, imgH));
    return { w: even(imgW * scale), h: even(imgH * scale) };
  }

  const base = 1080;
  return ratio >= 1
    ? { w: even(base), h: even(base / ratio) }
    : { w: even(base * ratio), h: even(base) };
}

/** Pick the lowest-level H.264 codec string the browser accepts for W×H. */
async function pickCodec(W: number, H: number): Promise<string> {
  const candidates = [
    "avc1.42E029", // baseline 4.1 (most compatible)
    "avc1.42E033", // baseline 5.1
    "avc1.4D4033", // main 5.1
    "avc1.640033", // high 5.1
    "avc1.640034", // high 5.2
  ];
  for (const codec of candidates) {
    const cfg: VideoEncoderConfig = {
      codec,
      width: W,
      height: H,
      bitrate: 6_000_000,
      framerate: FPS,
    };
    const { supported } = await VideoEncoder.isConfigSupported(cfg);
    if (supported) return codec;
  }
  throw new Error(`This browser can't encode ${W}×${H} video.`);
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

function drawWatermark(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const cx = W / 2;
  const cy = H - 70;
  ctx.save();
  ctx.font = "600 34px Sora, system-ui, sans-serif";
  const label = "noosho";
  const tw = ctx.measureText(label).width;
  const gap = 14;
  const padX = 26;
  const totalW = 36 + gap + tw + padX * 2;
  const h = 64;
  roundRect(ctx, cx - totalW / 2, cy - h / 2, totalW, h, h / 2);
  ctx.fillStyle = "rgba(24,20,16,0.78)";
  ctx.fill();
  const rx = cx - totalW / 2 + padX + 16;
  ctx.lineWidth = 5;
  ctx.strokeStyle = "#faf6f0";
  ctx.beginPath();
  ctx.arc(rx, cy, 14, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "#bd6a43";
  ctx.beginPath();
  ctx.arc(rx + 18, cy, 14, 0, Math.PI * 2);
  ctx.stroke();
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
  W: number,
  H: number,
  revealX: number // fraction [0..1] of the width still showing "before" from left
) {
  ctx.clearRect(0, 0, W, H);

  // Foreground = after, cover-filled edge-to-edge (no bands).
  drawCover(ctx, after, W, H);

  // Before clipped to the left reveal portion.
  const splitW = W * revealX;
  if (splitW > 0.5) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, splitW, H);
    ctx.clip();
    drawCover(ctx, before, W, H);
    ctx.restore();
  }

  // Handle line + grip while wiping.
  if (revealX > 0.001 && revealX < 0.999) {
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(splitW, 0);
    ctx.lineTo(splitW, H);
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(splitW, H / 2, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#a04525";
    ctx.font = "700 26px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("‹ ›", splitW, H / 2 + 1);
    ctx.restore();
  }

  // Before / After pills near the top.
  const pillY = 44;
  if (revealX > 0.05) {
    drawPill(ctx, "Before", 70, pillY, "rgba(255,255,255,0.92)", "#1c1917");
  }
  drawPill(ctx, "After", W - 60, pillY, "#a04525", "#ffffff");

  drawWatermark(ctx, W, H);
}

export interface RevealVideoInput {
  beforeUrl: string;
  afterUrl: string;
  aspect?: RevealAspect;
}

/** Render the before→after wipe as an H.264 MP4 in the chosen aspect, in-browser. */
export async function generateRevealVideo(
  { beforeUrl, afterUrl, aspect = "original" }: RevealVideoInput,
  onProgress?: (fraction: number) => void
): Promise<Blob> {
  if (!isRevealVideoSupported()) {
    throw new Error("Video export needs a Chromium browser (Chrome or Edge).");
  }

  const [before, after] = await Promise.all([
    loadImage(beforeUrl),
    loadImage(afterUrl),
  ]);

  const { w: W, h: H } = outputSize(aspect, after.width, after.height);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Could not get a 2D canvas context.");

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

  encoder.configure({
    codec: await pickCodec(W, H),
    width: W,
    height: H,
    bitrate: 6_000_000,
    framerate: FPS,
  });

  const frameDur = 1_000_000 / FPS; // microseconds
  for (let i = 0; i < TOTAL; i++) {
    let revealX = 1;
    if (i >= HOLD_BEFORE && i < HOLD_BEFORE + WIPE) {
      revealX = 1 - smoothstep((i - HOLD_BEFORE) / WIPE);
    } else if (i >= HOLD_BEFORE + WIPE) {
      revealX = 0;
    }

    renderFrame(ctx, before, after, W, H, revealX);

    const frame = new VideoFrame(canvas, {
      timestamp: Math.round(i * frameDur),
      duration: Math.round(frameDur),
    });
    encoder.encode(frame, { keyFrame: i % FPS === 0 });
    frame.close();

    if (onProgress) onProgress((i + 1) / TOTAL);

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
