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
