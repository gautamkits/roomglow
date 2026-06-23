import { getDesign } from "@/lib/db";

export const runtime = "nodejs";

function decodeDataUrl(dataUrl: string) {
  const m = dataUrl.match(/^data:(image\/\w+);base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return null;
  return { mime: m[1], buffer: Buffer.from(m[2], "base64") };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ designId: string; variant: string }> }
) {
  const { designId, variant } = await params;
  const design = await getDesign(designId);
  if (!design) return new Response("Not found", { status: 404 });

  const url: string =
    variant === "before"
      ? design.original_image_url
      : design.generated_image_url;

  if (url?.startsWith("http")) return Response.redirect(url, 302);

  const decoded = url ? decodeDataUrl(url) : null;
  if (!decoded) return new Response("No image", { status: 404 });

  return new Response(new Uint8Array(decoded.buffer), {
    headers: {
      "Content-Type": decoded.mime,
      "Cache-Control": "public, max-age=86400, s-maxage=604800, immutable",
    },
  });
}
