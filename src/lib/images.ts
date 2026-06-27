import { getDesign } from "@/lib/db";
import sharp from "sharp";

/** Tiny blur-up placeholder (data URL) for next/image placeholder="blur". */
export async function makeBlurDataUrl(buffer: Buffer): Promise<string> {
  const out = await sharp(buffer)
    .resize(16, 16, { fit: "inside" })
    .webp({ quality: 40 })
    .toBuffer();
  return `data:image/webp;base64,${out.toString("base64")}`;
}

/**
 * Build a deliberately-degraded, watermarked preview of a generated design.
 * Served to anyone who hasn't unlocked the design (paywall). It is downscaled,
 * softly blurred, and tiled with a repeating watermark so it can't be passed off
 * as the real, full-resolution product — closing the "locked image leaks via a
 * public URL" gap (R1). The full-resolution master is only ever served to
 * entitled viewers through the gated image route.
 */
export async function makeWatermarkedPreview(buffer: Buffer): Promise<Buffer> {
  const resized = await sharp(buffer)
    .resize({ width: 720, withoutEnlargement: true })
    .toBuffer();
  const meta = await sharp(resized).metadata();
  const W = meta.width ?? 720;
  const H = meta.height ?? 540;

  const tile = 230;
  const marks: string[] = [];
  for (let y = 40; y < H + tile; y += tile) {
    for (let x = -20; x < W + tile; x += tile) {
      marks.push(
        `<text x="${x}" y="${y}" font-family="sans-serif" font-size="22" font-weight="600" fill="rgba(255,255,255,0.38)" transform="rotate(-30 ${x} ${y})">Noosho · preview</text>`
      );
    }
  }
  const svg = Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${marks.join("")}</svg>`
  );

  return sharp(resized)
    .blur(5)
    .composite([{ input: svg }])
    .jpeg({ quality: 62 })
    .toBuffer();
}

function decodeDataUrl(dataUrl: string): Buffer | null {
  const m = dataUrl?.match(/^data:image\/\w+;base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return null;
  return Buffer.from(m[1], "base64");
}

/** Load before + after image buffers for a design (data URL or remote URL). */
export async function loadDesignImages(
  designId: string
): Promise<{ before: Buffer; after: Buffer } | null> {
  const d = await getDesign(designId);
  if (!d) return null;

  const get = async (url: string): Promise<Buffer | null> => {
    if (!url) return null;
    if (url.startsWith("http")) {
      const res = await fetch(url);
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    }
    return decodeDataUrl(url);
  };

  const [before, after] = await Promise.all([
    get(d.original_image_url),
    get(d.generated_image_url),
  ]);
  if (!before || !after) return null;
  return { before, after };
}
