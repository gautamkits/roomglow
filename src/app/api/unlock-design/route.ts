import { NextResponse, after } from "next/server";
import { auth } from "@/auth";
import { unlockDesign, getDesign, saveEventDate } from "@/lib/db";
import { localeFromRequest, PAYMENT_ENABLED } from "@/lib/locale";
import { isAdminEmail } from "@/lib/admin";
import { ensureHotspots } from "@/lib/hotspots";
import { notifyAdminError } from "@/lib/email";

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

    // Already paid/unlocked → idempotent success, but only for the owner (or an
    // unowned design). Never confirm unlock to a user who doesn't own it.
    if (design.is_unlocked) {
      if (design.user_id && design.user_id !== session.user.id) {
        return NextResponse.json(
          { error: "This design belongs to another account." },
          { status: 403 }
        );
      }
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

    // Claim the design for this user and unlock it. The DB guard rejects any
    // attempt to claim a design already owned by a different account.
    const claimed = await unlockDesign(designId, session.user.id);
    if (!claimed) {
      return NextResponse.json(
        { error: "This design belongs to another account." },
        { status: 403 }
      );
    }

    // Hotspot detection was deferred for the locked design — fill it in now that
    // it's entitled to be viewed (non-blocking; P1-b).
    after(() => ensureHotspots(designId).catch(() => {}));

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
    await notifyAdminError({ route: "unlock-design", error });
    return NextResponse.json({ error: "Failed to unlock" }, { status: 500 });
  }
}
