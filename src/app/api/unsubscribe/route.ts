import { NextResponse } from "next/server";
import { optOutEmail, resubscribeEmail } from "@/lib/db";
import { verifyUnsubscribeSignature } from "@/lib/email";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { SITE_URL } from "@/lib/site";

// Unsubscribe has to work from an inbox, months later, with no session — so the
// link is HMAC-signed and stateless rather than a stored token.
export const runtime = "nodejs";

function params(request: Request) {
  const url = new URL(request.url);
  return {
    email: (url.searchParams.get("e") || "").trim().toLowerCase(),
    sig: url.searchParams.get("s") || "",
  };
}

/**
 * GET renders the confirmation page and deliberately does NOT mutate — mail
 * scanners and link prefetchers follow every URL in a message, so a mutating
 * GET would silently unsubscribe people who never clicked. The one exception is
 * `?confirm=1`, which the page's own form posts back to.
 */
export async function GET(request: Request) {
  const { email, sig } = params(request);
  const valid = verifyUnsubscribeSignature(email, sig);
  const url = new URL(request.url);
  const done = url.searchParams.get("done");

  const page = (title: string, body: string, form?: string) =>
    new NextResponse(
      `<!DOCTYPE html><html><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="robots" content="noindex" />
<title>${title} — Noosho</title></head>
<body style="margin:0;background:#faf6f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:64px 20px;">
    <div style="background:#fff;border:1px solid #ece7e0;border-radius:18px;padding:32px;">
      <p style="font-size:21px;font-weight:700;color:#181410;margin:0 0 16px;">noosho</p>
      <h1 style="font-size:22px;color:#1c1917;margin:0 0 12px;">${title}</h1>
      <p style="font-size:15px;line-height:1.6;color:#78716c;margin:0;">${body}</p>
      ${form || ""}
      <p style="margin:24px 0 0;"><a href="${SITE_URL}" style="color:#a04525;font-size:14px;">Back to noosho.com</a></p>
    </div>
  </div>
</body></html>`,
      { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }
    );

  if (!valid) {
    return page(
      "Link not recognised",
      "This unsubscribe link is invalid or has expired. Contact us and we'll remove you manually."
    );
  }

  if (done === "1") {
    return page(
      "You're unsubscribed",
      `We won't send marketing emails to <strong>${email}</strong> any more. You'll still get essential messages like sign-in links and designs you've paid for.`,
      `<form method="POST" action="/api/unsubscribe?e=${encodeURIComponent(email)}&s=${sig}&resubscribe=1" style="margin:20px 0 0;">
         <button type="submit" style="background:none;border:none;padding:0;color:#a04525;font-size:14px;text-decoration:underline;cursor:pointer;">Actually, re-subscribe me</button>
       </form>`
    );
  }

  return page(
    "Unsubscribe",
    `Stop sending marketing emails to <strong>${email}</strong>?`,
    `<form method="POST" action="/api/unsubscribe?e=${encodeURIComponent(email)}&s=${sig}" style="margin:22px 0 0;">
       <button type="submit" style="background:#a04525;color:#fff;border:none;border-radius:11px;padding:13px 28px;font-size:15px;font-weight:600;cursor:pointer;">Unsubscribe</button>
     </form>`
  );
}

/**
 * POST performs the write. Also satisfies RFC 8058 List-Unsubscribe-Post, which
 * Gmail and Yahoo call directly with no user interaction.
 */
export async function POST(request: Request) {
  const { email, sig } = params(request);
  const url = new URL(request.url);

  if (!rateLimit(`unsub:${clientIp(request)}`, 20, 10 * 60 * 1000).ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  if (!verifyUnsubscribeSignature(email, sig)) {
    return NextResponse.json({ error: "Invalid link" }, { status: 400 });
  }

  const resubscribe = url.searchParams.get("resubscribe") === "1";
  try {
    if (resubscribe) {
      await resubscribeEmail(email);
    } else {
      await optOutEmail(email, "user_unsubscribe");
    }
  } catch (err) {
    console.error("[unsubscribe] failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }

  // One-click clients (RFC 8058) just want a 2xx; browsers get the page.
  if (!request.headers.get("accept")?.includes("text/html")) {
    return NextResponse.json({ ok: true });
  }
  // Redirect relative to the incoming request, not SITE_URL — otherwise a
  // preview deployment (or localhost) bounces the user to production.
  const back = new URL("/api/unsubscribe", url.origin);
  back.searchParams.set("e", email);
  back.searchParams.set("s", sig);
  if (!resubscribe) back.searchParams.set("done", "1");
  return NextResponse.redirect(back, { status: 303 });
}
