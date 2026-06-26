import { Muxer, ArrayBufferTarget } from "mp4-muxer";

export type RevealAspect = "original" | "1:1" | "4:5" | "9:16";

const FPS = 30;
const HOLD_BEFORE = 24; // ~0.8s
const WIPE = 90; // ~3.0s
const HOLD_AFTER = 42; // ~1.4s
const REVEAL_TOTAL = HOLD_BEFORE + WIPE + HOLD_AFTER;
const PRODUCT_SEG = 45; // ~1.5s per shoppable product card
const PRODUCT_END_HOLD = 15; // ~0.5s extra hold on the final card (loop-friendly)
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

/** Word-wrap text to a max width, capped to maxLines (last line ellipsized). */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (let i = 0; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = words[i];
      if (lines.length === maxLines) break; // no room for more lines
    } else {
      line = test;
    }
  }
  if (lines.length < maxLines) {
    lines.push(line);
    return lines;
  }
  // Ran out of lines — ellipsize whatever didn't fit onto the last line.
  let last = lines[maxLines - 1];
  if (line && line !== last) last = `${last} ${line}`;
  while (ctx.measureText(`${last}…`).width > maxWidth && last.length > 1) {
    last = last.slice(0, -1).trimEnd();
  }
  lines[maxLines - 1] = `${last}…`;
  return lines.slice(0, maxLines);
}

/** Draw a shoppable product card over the (dimmed) after design. t: 0→1 fade-in. */
function renderProductCard(
  ctx: CanvasRenderingContext2D,
  after: HTMLImageElement,
  prodImg: HTMLImageElement | null,
  title: string,
  price: string,
  W: number,
  H: number,
  p: number // 0→1 across the segment
) {
  ctx.clearRect(0, 0, W, H);
  drawCover(ctx, after, W, H);

  // Dim the background so the card pops.
  ctx.fillStyle = "rgba(20,16,12,0.55)";
  ctx.fillRect(0, 0, W, H);

  const ease = smoothstep(Math.min(1, p / 0.27)); // ~0.4s fade-in
  const slide = (1 - ease) * H * 0.06;
  ctx.save();
  ctx.globalAlpha = ease;
  ctx.translate(0, slide);

  // Card geometry — scale to the frame's smaller dimension.
  const s = Math.min(W, H);
  const cardW = Math.min(W * 0.84, s * 1.15);
  const pad = s * 0.045;
  const thumb = s * 0.26;
  const cardH = thumb + pad * 2;
  const cx = (W - cardW) / 2;
  const cy = H * 0.5 - cardH / 2;

  // Card background.
  roundRect(ctx, cx, cy, cardW, cardH, s * 0.04);
  ctx.fillStyle = "#ffffff";
  ctx.fill();

  // Product thumbnail (contain-fit on white tile).
  const tileX = cx + pad;
  const tileY = cy + pad;
  roundRect(ctx, tileX, tileY, thumb, thumb, s * 0.025);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = "#f5f1ea";
  ctx.fillRect(tileX, tileY, thumb, thumb);
  if (prodImg) {
    const scale = Math.min(thumb / prodImg.width, thumb / prodImg.height);
    const w = prodImg.width * scale;
    const h = prodImg.height * scale;
    ctx.drawImage(prodImg, tileX + (thumb - w) / 2, tileY + (thumb - h) / 2, w, h);
  }
  ctx.restore();

  // Text column.
  const textX = tileX + thumb + pad * 0.8;
  const textW = cx + cardW - pad - textX;
  let ty = tileY + s * 0.03;

  const titleSize = Math.round(s * 0.038);
  ctx.font = `600 ${titleSize}px Sora, system-ui, sans-serif`;
  ctx.fillStyle = "#1c1917";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const titleLines = wrapText(ctx, title, textW, 2);
  for (const l of titleLines) {
    ctx.fillText(l, textX, ty);
    ty += titleSize * 1.25;
  }

  // Price.
  ty += s * 0.012;
  const priceSize = Math.round(s * 0.05);
  ctx.font = `700 ${priceSize}px Sora, system-ui, sans-serif`;
  ctx.fillStyle = "#a04525";
  ctx.fillText(price, textX, ty);

  // "Shop the look" pill anchored bottom-left of the text column.
  const pillSize = Math.round(s * 0.026);
  ctx.font = `600 ${pillSize}px Sora, system-ui, sans-serif`;
  const pillText = "Shop the look · noosho.com";
  const pillTextW = ctx.measureText(pillText).width;
  const pillPadX = s * 0.022;
  const pillH = pillSize + s * 0.022;
  const pillW = pillTextW + pillPadX * 2;
  const pillX = textX;
  const pillY = cy + cardH - pad - pillH;
  roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
  ctx.fillStyle = "#a04525";
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "middle";
  ctx.fillText(pillText, pillX + pillPadX, pillY + pillH / 2 + 1);

  ctx.restore();

  drawWatermark(ctx, W, H);
}

export interface RevealProduct {
  imageUrl: string; // same-origin (proxied) URL
  title: string;
  price: string;
  x?: number; // hotspot center X as % of the design image
  y?: number; // hotspot center Y as % of the design image
}

/** Map a hotspot (x%,y%) to a canvas point using the same cover transform as drawCover. */
function mapCover(
  img: HTMLImageElement,
  W: number,
  H: number,
  xPct: number,
  yPct: number
): { x: number; y: number } {
  const scale = Math.max(W / img.width, H / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  const ox = (W - dw) / 2;
  const oy = (H - dh) / 2;
  return { x: ox + (xPct / 100) * dw, y: oy + (yPct / 100) * dh };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Draw an animated arrow pointing to the product at (hx,hy), then a product chip. */
function renderProductCallout(
  ctx: CanvasRenderingContext2D,
  after: HTMLImageElement,
  prodImg: HTMLImageElement | null,
  title: string,
  price: string,
  hx: number,
  hy: number,
  W: number,
  H: number,
  p: number // 0→1 across the segment
) {
  ctx.clearRect(0, 0, W, H);
  drawCover(ctx, after, W, H);
  // Soft dim — lighter than the full card so the room stays visible.
  ctx.fillStyle = "rgba(20,16,12,0.32)";
  ctx.fillRect(0, 0, W, H);

  const s = Math.min(W, H);

  // ── Chip geometry: place in the opposite half from the hotspot, clamped. ──
  const chipW = Math.min(W * 0.62, s * 0.95);
  const thumb = s * 0.16;
  const chipPad = s * 0.03;
  const chipH = thumb + chipPad * 2;
  const margin = s * 0.05;
  const chipX = clamp(hx - chipW / 2, margin, W - chipW - margin);
  const chipY =
    hy < H / 2 ? H - chipH - margin * 1.4 : margin * 1.4; // opposite vertical half

  // ── Phase 1: pulsing ring on the product ──
  const ringIn = smoothstep(clamp(p / 0.25, 0, 1));
  const pulse = 1 + 0.12 * Math.sin(p * Math.PI * 6);
  const ringR = s * 0.035 * ringIn * pulse;
  ctx.save();
  ctx.globalAlpha = ringIn;
  ctx.beginPath();
  ctx.arc(hx, hy, ringR, 0, Math.PI * 2);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = Math.max(3, s * 0.006);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(hx, hy, s * 0.008, 0, Math.PI * 2);
  ctx.fillStyle = "#a04525";
  ctx.fill();
  ctx.restore();

  // ── Phase 2: arrow draws from chip toward the dot ──
  const arrowP = smoothstep(clamp((p - 0.2) / 0.4, 0, 1));
  if (arrowP > 0.01) {
    const startX = clamp(hx, chipX + chipPad, chipX + chipW - chipPad);
    const startY = hy < H / 2 ? chipY : chipY + chipH; // leave from chip edge nearest dot
    const endX = hx;
    const endYFull = hy + (hy < H / 2 ? ringR + s * 0.02 : -(ringR + s * 0.02));
    const curX = startX + (endX - startX) * arrowP;
    const curY = startY + (endYFull - startY) * arrowP;
    ctx.save();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = Math.max(3, s * 0.006);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(curX, curY);
    ctx.stroke();
    if (arrowP > 0.85) {
      const ang = Math.atan2(endYFull - startY, endX - startX);
      const head = s * 0.022;
      ctx.beginPath();
      ctx.moveTo(curX, curY);
      ctx.lineTo(curX - head * Math.cos(ang - 0.4), curY - head * Math.sin(ang - 0.4));
      ctx.moveTo(curX, curY);
      ctx.lineTo(curX - head * Math.cos(ang + 0.4), curY - head * Math.sin(ang + 0.4));
      ctx.stroke();
    }
    ctx.restore();
  }

  // ── Phase 3: product chip fades/slides in ──
  const chipIn = smoothstep(clamp((p - 0.4) / 0.4, 0, 1));
  if (chipIn > 0.01) {
    ctx.save();
    ctx.globalAlpha = chipIn;
    ctx.translate(0, (1 - chipIn) * s * 0.03);

    roundRect(ctx, chipX, chipY, chipW, chipH, s * 0.03);
    ctx.fillStyle = "#ffffff";
    ctx.fill();

    const tileX = chipX + chipPad;
    const tileY = chipY + chipPad;
    roundRect(ctx, tileX, tileY, thumb, thumb, s * 0.02);
    ctx.save();
    ctx.clip();
    ctx.fillStyle = "#f5f1ea";
    ctx.fillRect(tileX, tileY, thumb, thumb);
    if (prodImg) {
      const sc = Math.min(thumb / prodImg.width, thumb / prodImg.height);
      const w = prodImg.width * sc;
      const h = prodImg.height * sc;
      ctx.drawImage(prodImg, tileX + (thumb - w) / 2, tileY + (thumb - h) / 2, w, h);
    }
    ctx.restore();

    const textX = tileX + thumb + chipPad * 0.8;
    const textW = chipX + chipW - chipPad - textX;
    let ty = tileY + s * 0.012;
    const titleSize = Math.round(s * 0.032);
    ctx.font = `600 ${titleSize}px Sora, system-ui, sans-serif`;
    ctx.fillStyle = "#1c1917";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    for (const l of wrapText(ctx, title, textW, 2)) {
      ctx.fillText(l, textX, ty);
      ty += titleSize * 1.25;
    }
    ty += s * 0.008;
    const priceSize = Math.round(s * 0.04);
    ctx.font = `700 ${priceSize}px Sora, system-ui, sans-serif`;
    ctx.fillStyle = "#a04525";
    ctx.fillText(price, textX, ty);

    const pillSize = Math.round(s * 0.024);
    ctx.font = `600 ${pillSize}px Sora, system-ui, sans-serif`;
    const pillText = "Shop · noosho.com";
    const pillW = ctx.measureText(pillText).width + s * 0.04;
    const pillH = pillSize + s * 0.02;
    const pillX = textX;
    const pillY = chipY + chipH - chipPad - pillH;
    roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
    ctx.fillStyle = "#a04525";
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "middle";
    ctx.fillText(pillText, pillX + s * 0.02, pillY + pillH / 2 + 1);

    ctx.restore();
  }

  drawWatermark(ctx, W, H);
}

export interface RevealVideoInput {
  beforeUrl: string;
  afterUrl: string;
  aspect?: RevealAspect;
  products?: RevealProduct[];
}

/** Render the before→after wipe as an H.264 MP4 in the chosen aspect, in-browser. */
export async function generateRevealVideo(
  { beforeUrl, afterUrl, aspect = "original", products = [] }: RevealVideoInput,
  onProgress?: (fraction: number) => void
): Promise<Blob> {
  if (!isRevealVideoSupported()) {
    throw new Error("Video export needs a Chromium browser (Chrome or Edge).");
  }

  const [before, after] = await Promise.all([
    loadImage(beforeUrl),
    loadImage(afterUrl),
  ]);

  // Load product card images (same-origin/proxied). Drop any that fail so a
  // single broken image never breaks the export.
  type Card = {
    img: HTMLImageElement;
    title: string;
    price: string;
    x?: number;
    y?: number;
  };
  const cards = (
    await Promise.all(
      products.slice(0, 2).map(async (p): Promise<Card | null> => {
        try {
          const img = await loadImage(p.imageUrl);
          return { img, title: p.title, price: p.price, x: p.x, y: p.y };
        } catch {
          return null;
        }
      })
    )
  ).filter((c): c is Card => c !== null);

  const TOTAL =
    REVEAL_TOTAL + cards.length * PRODUCT_SEG + (cards.length ? PRODUCT_END_HOLD : 0);

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
    if (i < REVEAL_TOTAL) {
      // ── Reveal phase: hold before → wipe → hold after ──
      let revealX = 1;
      if (i >= HOLD_BEFORE && i < HOLD_BEFORE + WIPE) {
        revealX = 1 - smoothstep((i - HOLD_BEFORE) / WIPE);
      } else if (i >= HOLD_BEFORE + WIPE) {
        revealX = 0;
      }
      renderFrame(ctx, before, after, W, H, revealX);
    } else {
      // ── Product card phase ──
      const into = i - REVEAL_TOTAL;
      let idx = Math.floor(into / PRODUCT_SEG);
      if (idx > cards.length - 1) idx = cards.length - 1; // end-hold on last card
      const local = into - idx * PRODUCT_SEG;
      const card = cards[idx];
      const p = Math.min(1, local / PRODUCT_SEG);

      // Use the in-scene arrow callout when the product's hotspot lands inside
      // the frame; otherwise fall back to the centered product card.
      let pt: { x: number; y: number } | null = null;
      if (card.x != null && card.y != null) {
        const m = mapCover(after, W, H, card.x, card.y);
        if (m.x >= 0 && m.x <= W && m.y >= 0 && m.y <= H) pt = m;
      }
      if (pt) {
        renderProductCallout(ctx, after, card.img, card.title, card.price, pt.x, pt.y, W, H, p);
      } else {
        renderProductCard(ctx, after, card.img, card.title, card.price, W, H, p);
      }
    }

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
