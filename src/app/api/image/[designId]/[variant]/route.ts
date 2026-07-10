import { getDesign } from "@/lib/db";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { designVisibility } from "@/lib/access";

export const runtime = "nodejs";

function decodeDataUrl(dataUrl: string) {
  const m = dataUrl.match(/^data:(image\/\w+);base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return null;
  return { mime: m[1], buffer: Buffer.from(m[2], "base64") };
}

async function serve(url: string, request: Request, cache: string) {
  // ?inline=1 streams the bytes from this same origin (instead of a 302 to the
  // cross-origin Blob URL) so the image can be drawn to a canvas without
  // tainting it — required for the in-browser reveal-video export.
  const inline = new URL(request.url).searchParams.get("inline");
  if (url.startsWith("http") && inline) {
    const upstream = await fetch(url);
    if (!upstream.ok) return new Response("Upstream error", { status: 502 });
    return new Response(upstream.body, {
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "image/jpeg",
        "Cache-Control": cache,
      },
    });
  }
  if (url.startsWith("http")) return Response.redirect(url, 302);

  const decoded = decodeDataUrl(url);
  if (!decoded) return new Response("No image", { status: 404 });
  return new Response(new Uint8Array(decoded.buffer), {
    headers: { "Content-Type": decoded.mime, "Cache-Control": cache },
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ designId: string; variant: string }> }
) {
  const { designId, variant } = await params;
  const design = await getDesign(designId);
  if (!design) return new Response("Not found", { status: 404 });

  const session = await auth();

  // Privacy: a private design's pixels (even the watermarked preview) are only
  // served to viewers allowed by the sharing model — owner, shared emails,
  // admins, or everyone once gallery-approved.
  const { canView } = await designVisibility(design, session);
  if (!canView) return new Response("Private", { status: 403 });

  // Entitlement: the full-resolution master is only served once a design is
  // unlocked (paid / free-market claim), publicly approved for the gallery, or
  // to an admin. Everyone else gets the watermarked preview — never the master.
  const entitled =
    design.is_unlocked ||
    design.gallery_status === "approved" ||
    isAdminEmail(session?.user?.email);

  if (variant === "before") {
    // The original photo is part of the paid before/after — gate it too.
    if (!entitled) return new Response("Locked", { status: 403 });
    const url: string = design.original_image_url;
    if (!url) return new Response("No image", { status: 404 });
    return serve(url, request, "private, max-age=86400");
  }

  // variant === "after" (the generated design)
  if (entitled) {
    const url: string = design.generated_image_url;
    if (!url) return new Response("No image", { status: 404 });
    return serve(url, request, "public, max-age=86400, s-maxage=604800, immutable");
  }

  // Not entitled → serve the watermarked preview only.
  const preview: string | null = design.preview_image_url;
  if (!preview) return new Response("Locked", { status: 403 });
  return serve(preview, request, "private, max-age=3600");
}
