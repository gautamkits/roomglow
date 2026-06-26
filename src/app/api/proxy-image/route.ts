export const runtime = "nodejs";

// Same-origin image proxy so cross-origin product images (Amazon CDN) can be
// drawn to the export canvas without tainting it (required for WebCodecs).
export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get("url");
  if (!url) return new Response("Missing url", { status: 400 });

  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return new Response("Bad url", { status: 400 });
  }
  if (target.protocol !== "https:") {
    return new Response("Only https allowed", { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(target.toString());
  } catch {
    return new Response("Upstream fetch failed", { status: 502 });
  }
  if (!upstream.ok) return new Response("Upstream error", { status: 502 });

  const contentType = upstream.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) {
    return new Response("Not an image", { status: 415 });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400, s-maxage=604800, immutable",
    },
  });
}
