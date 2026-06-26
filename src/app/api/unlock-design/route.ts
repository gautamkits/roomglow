import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { unlockDesign, getDesign, saveEventDate } from "@/lib/db";
import { localeFromRequest, PAYMENT_ENABLED } from "@/lib/locale";
import { isAdminEmail } from "@/lib/admin";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { designId } = await request.json();
    if (!designId) {
      return NextResponse.json({ error: "Missing designId" }, { status: 400 });
    }

    const design = await getDesign(designId);
    if (!design) {
      return NextResponse.json({ error: "Design not found" }, { status: 404 });
    }

    // Already paid/unlocked → idempotent success (returning paid users).
    if (design.is_unlocked) {
      return NextResponse.json({ unlocked: true });
    }

    // In paid markets, only admins unlock free here. Everyone else must pay —
    // payment-driven unlock happens exclusively in stripe/success (and the
    // 100%-off branch in stripe/checkout). Free markets (India) unlock on claim.
    const locale = localeFromRequest(request);
    const entitled =
      !PAYMENT_ENABLED[locale] || isAdminEmail(session.user.email);
    if (!entitled) {
      return NextResponse.json({ unlocked: false });
    }

    // Claim the design for this user and unlock it
    await unlockDesign(designId, session.user.id);

    // Capture event date for future re-engagement
    if (design.mode === "event" && design.event_config) {
      const cfg = typeof design.event_config === "string"
        ? JSON.parse(design.event_config)
        : design.event_config;
      if (cfg.eventDate) {
        await saveEventDate({
          userId: session.user.id,
          eventType: cfg.eventType,
          eventLabel: cfg.honoree || cfg.eventLabel,
          eventDate: cfg.eventDate,
          honoree: cfg.honoree,
        });
      }
    }

    return NextResponse.json({ unlocked: true });
  } catch (error) {
    console.error("Unlock design failed:", error);
    return NextResponse.json({ error: "Failed to unlock" }, { status: 500 });
  }
}
