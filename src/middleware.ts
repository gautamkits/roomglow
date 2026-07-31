import { NextRequest, NextResponse } from "next/server";

// Meta's click-attribution window is 90 days, so the click id must outlive the
// 30-day locale cookie.
const FB_COOKIE_MAX_AGE = 60 * 60 * 24 * 90;

/**
 * Build a Meta browser-id value: `fb.<subdomainIndex>.<creationTime>.<payload>`.
 * Index 1 = cookie written on the root domain, which is what we set below.
 */
function fbCookie(payload: string): string {
  return `fb.1.${Date.now()}.${payload}`;
}

function randomFbpPayload(): string {
  // fbevents.js uses a large random integer; match the shape, not the exact RNG.
  const buf = new Uint32Array(2);
  crypto.getRandomValues(buf);
  return `${buf[0]}${buf[1]}`;
}

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // Only set once — respect user's manual override
  if (!request.cookies.has("noosho-locale")) {
    const country = request.headers.get("x-vercel-ip-country") ?? "IN";
    const locale = country === "US" ? "US" : "IN";
    response.cookies.set("noosho-locale", locale, {
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
      sameSite: "lax",
    });
  }

  // The Instagram in-app browser blocks connect.facebook.net, so the Pixel never
  // runs there and never writes _fbc/_fbp. Those cookies are exactly what our
  // server-side CAPI events (`metaContextFromRequest`) use to tie a conversion
  // back to an ad click — so on our highest-volume ad channel every conversion
  // reached Meta unattributable. Middleware runs regardless of JS, so synthesize
  // both cookies here instead of depending on the Pixel.
  //
  // Not httpOnly: if fbevents.js *does* load, it reads these and stays
  // consistent with what the server already sent.
  const cookieOpts = {
    path: "/",
    maxAge: FB_COOKIE_MAX_AGE,
    sameSite: "lax",
    httpOnly: false,
  } as const;

  const fbclid = request.nextUrl.searchParams.get("fbclid");
  if (fbclid && !request.cookies.has("_fbc")) {
    response.cookies.set("_fbc", fbCookie(fbclid), cookieOpts);
  }
  if (!request.cookies.has("_fbp")) {
    response.cookies.set("_fbp", fbCookie(randomFbpPayload()), cookieOpts);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons|api/cron).*)"],
};
