import { NextResponse } from "next/server";
import { randomBytes, createHash } from "crypto";
import { createMagicToken } from "@/lib/db";
import { sendMagicLinkEmail } from "@/lib/email";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { SITE_URL } from "@/lib/site";

// Needs Node crypto + Postgres — not edge.
export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HOUR = 60 * 60 * 1000;

/** Only allow same-site relative redirect targets (guards against open redirect). */
function safePath(cb: unknown): string {
  if (typeof cb === "string" && cb.startsWith("/") && !cb.startsWith("//")) {
    return cb;
  }
  return "/create?resume=1";
}

export async function POST(request: Request) {
  let body: { email?: unknown; callbackUrl?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }

  const email = String(body?.email ?? "").trim().toLowerCase();
  const callbackUrl = safePath(body?.callbackUrl);
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json(
      { ok: false, error: "Enter a valid email address." },
      { status: 400 }
    );
  }

  // Throttle by IP and by email. On limit we still return a generic success so
  // the endpoint can't be used to probe which addresses exist.
  const ip = clientIp(request);
  const ipOk = rateLimit(`magic:ip:${ip}`, 8, HOUR).ok;
  const emailOk = rateLimit(`magic:email:${email}`, 4, HOUR).ok;
  if (!ipOk || !emailOk) {
    return NextResponse.json({ ok: true });
  }

  const raw = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(raw).digest("hex");
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  try {
    await createMagicToken(email, tokenHash, expiresAt);
    const link = `${SITE_URL}/auth/verify?token=${raw}&cb=${encodeURIComponent(
      callbackUrl
    )}`;
    const sent = await sendMagicLinkEmail({ to: email, link });
    if (!sent.ok) {
      return NextResponse.json(
        { ok: false, error: "Couldn't send the email. Please try again." },
        { status: 502 }
      );
    }
  } catch (e) {
    console.error("[magic/request] failed:", e);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
