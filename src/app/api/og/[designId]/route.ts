import sharp from "sharp";
import { loadDesignImages } from "@/lib/images";

export const runtime = "nodejs";

const H = 630; // half-height target; each panel H x H => 1260 x 630 (1.91:1 OG ratio)

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ designId: string }> }
) {
  const { designId } = await params;
  const imgs = await loadDesignImages(designId);
  if (!imgs) return new Response("Not found", { status: 404 });

  try {
    const panelW = 630;
    const [before, after] = await Promise.all(
      [imgs.before, imgs.after].map((b) =>
        sharp(b)
          .resize(panelW, H, { fit: "cover", position: "centre" })
          .toBuffer()
      )
    );

    const composite = await sharp({
      create: {
        width: panelW * 2,
        height: H,
        channels: 4,
        background: { r: 245, g: 245, b: 244, alpha: 1 },
      },
    })
      .composite([
        { input: before, left: 0, top: 0 },
        { input: after, left: panelW, top: 0 },
        {
          input: Buffer.from(
            `<svg width="${panelW * 2}" height="${H}">
              <rect x="20" y="${H - 50}" rx="8" width="92" height="32" fill="rgba(0,0,0,0.6)"/>
              <text x="32" y="${H - 28}" font-family="Arial" font-size="18" fill="white">Before</text>
              <rect x="${panelW + 20}" y="${H - 50}" rx="8" width="78" height="32" fill="rgba(194,65,12,0.85)"/>
              <text x="${panelW + 32}" y="${H - 28}" font-family="Arial" font-size="18" fill="white">After</text>
            </svg>`
          ),
          left: 0,
          top: 0,
        },
      ])
      .jpeg({ quality: 82 })
      .toBuffer();

    return new Response(new Uint8Array(composite), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=86400, s-maxage=604800, immutable",
      },
    });
  } catch (e) {
    console.error("OG composite failed:", e);
    return new Response("Error", { status: 500 });
  }
}
