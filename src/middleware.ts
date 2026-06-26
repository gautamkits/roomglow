import { NextRequest, NextResponse } from "next/server";

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

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons|api/cron).*)"],
};
