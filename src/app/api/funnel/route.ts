import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { recordFunnelEvent } from "@/lib/db";
import { localeFromRequest } from "@/lib/locale";
import { rateLimit, clientIp } from "@/lib/rateLimit";

// Server-side funnel events. PostHog and the Meta Pixel are both blocked in the
// Instagram in-app browser, which is where most of our traffic comes from, so
// client analytics systematically under-count the exact users we care about.
// This endpoint is same-origin and unblockable.
export const runtime = "nodejs";

export async function POST(request: Request) {
  // Generous, since one session legitimately fires several events.
  if (!rateLimit(`funnel:${clientIp(request)}`, 120, 10 * 60 * 1000).ok) {
    return new NextResponse(null, { status: 204 });
  }

  try {
    const { name, props } = (await request.json()) as {
      name?: string;
      props?: Record<string, unknown>;
    };
    if (!name || typeof name !== "string") {
      return new NextResponse(null, { status: 204 });
    }

    const session = await auth().catch(() => null);
    await recordFunnelEvent({
      name: name.slice(0, 64),
      userId: session?.user?.id ?? null,
      locale: localeFromRequest(request),
      props: props ?? null,
    });
  } catch {
    // Telemetry must never surface an error to the user mid-flow.
  }
  // Always 204 — sendBeacon ignores the body, and a failure here is not the
  // caller's problem.
  return new NextResponse(null, { status: 204 });
}
