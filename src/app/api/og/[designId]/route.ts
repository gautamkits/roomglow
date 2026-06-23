import { getDesign } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ designId: string }> }
) {
  const { designId } = await params;
  const design = await getDesign(designId);
  if (!design) return new Response("Not found", { status: 404 });

  const dataUrl: string = design.generated_image_url || "";
  const m = dataUrl.match(/^data:(image\/\w+);base64,([A-Za-z0-9+/=]+)$/);
  if (!m) {
    // Already a normal URL — redirect to it
    if (dataUrl.startsWith("http")) {
      return Response.redirect(dataUrl, 302);
    }
    return new Response("No image", { status: 404 });
  }

  const buffer = Buffer.from(m[2], "base64");
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": m[1],
      "Cache-Control": "public, max-age=86400, s-maxage=604800, immutable",
    },
  });
}
