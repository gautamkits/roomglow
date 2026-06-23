import sharp from "sharp";
import { GIFEncoder, quantize, applyPalette } from "gifenc";
import { loadDesignImages } from "@/lib/images";

export const runtime = "nodejs";

const W = 600;
const H = 600;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ designId: string }> }
) {
  const { designId } = await params;
  const imgs = await loadDesignImages(designId);
  if (!imgs) return new Response("Not found", { status: 404 });

  try {
    // Normalize both to W x H raw RGBA
    const toRaw = (b: Buffer) =>
      sharp(b)
        .resize(W, H, { fit: "cover", position: "centre" })
        .ensureAlpha()
        .raw()
        .toBuffer();
    const [before, after] = await Promise.all([toRaw(imgs.before), toRaw(imgs.after)]);

    const enc = GIFEncoder();
    const px = W * H * 4;

    const addFrame = (rgba: Uint8Array, delay: number) => {
      const palette = quantize(rgba, 256);
      const index = applyPalette(rgba, palette);
      enc.writeFrame(index, W, H, { palette, delay });
    };

    // hold before
    addFrame(new Uint8Array(before), 900);

    // crossfade before -> after
    const steps = 6;
    for (let s = 1; s <= steps; s++) {
      const t = s / (steps + 1);
      const frame = new Uint8Array(px);
      for (let i = 0; i < px; i++) {
        frame[i] = Math.round(before[i] * (1 - t) + after[i] * t);
      }
      addFrame(frame, 120);
    }

    // hold after
    addFrame(new Uint8Array(after), 1400);

    enc.finish();
    const bytes = enc.bytes();

    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "image/gif",
        "Cache-Control": "public, max-age=86400, s-maxage=604800, immutable",
      },
    });
  } catch (e) {
    console.error("Share GIF failed:", e);
    return new Response("Error", { status: 500 });
  }
}
