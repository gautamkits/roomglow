import { NextResponse, after } from "next/server";
import { AMAZON_DOMAINS } from "@/lib/locale";
import { localeFromRequest } from "@/lib/locale";
import { recordAffiliateClick } from "@/lib/db";

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

/** Pull the ASIN out of a /dp/{ASIN} or /gp/product/{ASIN} path. */
function asinFrom(target: URL): string | null {
  const m = target.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
  return m ? m[1].toUpperCase() : null;
}

function intOrNull(v: string | null): number | null {
  if (!v) return null;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const u = params.get("u");
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

  // Attribution is written AFTER the response so a slow or failing insert can
  // never delay (or break) the redirect the user is waiting on. Context comes
  // from outboundHref; every field is optional, so an untagged legacy link
  // still records the ASIN and locale.
  const click = {
    designId: params.get("d"),
    productIndex: intOrNull(params.get("i")),
    category: params.get("c"),
    surface: params.get("s"),
    asin: asinFrom(target),
    locale: localeFromRequest(request),
  };
  after(() => recordAffiliateClick(click));

  return NextResponse.redirect(target.toString(), {
    status: 302,
    headers: { "X-Robots-Tag": "noindex, nofollow" },
  });
}
