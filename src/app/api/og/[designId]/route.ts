import sharp from "sharp";
import { loadDesignImages } from "@/lib/images";
import { getDesign } from "@/lib/db";

export const runtime = "nodejs";

const H = 630; // half-height target; each panel H x H => 1260 x 630 (1.91:1 OG ratio)

// Branded fallback used when a design isn't publicly viewable — never exposes
// the locked design's pixels through social-preview generation (R1).
async function brandedFallback() {
  const card = await sharp({
    create: {
      width: 1260,
      height: H,
      channels: 4,
      background: { r: 160, g: 69, b: 37, alpha: 1 },
    },
  })
    .composite([
      {
        input: Buffer.from(
          `<svg width="1260" height="${H}">
            <text x="630" y="300" font-family="Arial" font-size="64" font-weight="700" fill="white" text-anchor="middle">Noosho</text>
            <text x="630" y="360" font-family="Arial" font-size="28" fill="rgba(255,255,255,0.85)" text-anchor="middle">AI room &amp; event designs from one photo</text>
          </svg>`
        ),
        left: 0,
        top: 0,
      },
    ])
    .jpeg({ quality: 82 })
    .toBuffer();
  return new Response(new Uint8Array(card), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ designId: string }> }
) {
  const { designId } = await params;

  // Only public (gallery-approved) designs render real pixels into the OG card.
  // Social crawlers fetch this anonymously, so anything session-gated (including
  // unlocked-but-private designs) must get the branded placeholder — otherwise
  // a private design's before/after leaks through link previews.
  const design = await getDesign(designId);
  if (!design) return new Response("Not found", { status: 404 });
  if (design.gallery_status !== "approved") {
    return brandedFallback();
  }

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
