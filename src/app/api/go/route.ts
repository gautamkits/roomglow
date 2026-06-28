import { NextResponse } from "next/server";
import { AMAZON_DOMAINS } from "@/lib/locale";

export const runtime = "nodejs";

// Affiliate-link cloaking endpoint. Renders nowhere in HTML as a raw amazon.*
// URL — links point here, and we 302 to the real (allowlisted) destination with
// X-Robots-Tag noindex/nofollow so crawlers never follow or index it. Host is
// allowlisted to our Amazon marketplaces to prevent open-redirect abuse.
function isAllowedHost(host: string): boolean {
  return Object.values(AMAZON_DOMAINS).some(
    (d) => host === d || host.endsWith(`.${d}`)
  );
}

export async function GET(request: Request) {
  const u = new URL(request.url).searchParams.get("u");
  if (!u) return new Response("Missing url", { status: 400 });

  let target: URL;
  try {
    target = new URL(u);
  } catch {
    return new Response("Bad url", { status: 400 });
  }
  if (target.protocol !== "https:") {
    return new Response("Only https allowed", { status: 400 });
  }
  if (!isAllowedHost(target.hostname)) {
    return new Response("Host not allowed", { status: 403 });
  }

  return NextResponse.redirect(target.toString(), {
    status: 302,
    headers: { "X-Robots-Tag": "noindex, nofollow" },
  });
}
