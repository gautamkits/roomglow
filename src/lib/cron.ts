import { NextResponse } from "next/server";

/**
 * Shared auth guard for Vercel cron routes.
 *
 * The previous per-route guard was `if (process.env.CRON_SECRET && header !==
 * ...)` — which fails OPEN: with CRON_SECRET unset or blank, the endpoints were
 * publicly callable and anyone could trigger a full mail run. These routes send
 * email, so this now fails CLOSED: no secret configured means nothing runs.
 *
 * Returns a response to return early, or null when the request is authorised.
 */
export function assertCron(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error(
      "[cron] CRON_SECRET is not set — refusing to run. Set it in the Vercel project env."
    );
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
