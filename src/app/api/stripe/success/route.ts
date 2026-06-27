import { NextResponse, after } from "next/server";
import { auth } from "@/auth";
import { stripe } from "@/lib/stripe";
import { unlockDesign, getDesign, saveEventDate, incrementCouponUse } from "@/lib/db";
import { sendDesignReadyEmail } from "@/lib/email";
import { ensureHotspots } from "@/lib/hotspots";
import type { EventConfig, ProductResult } from "@/lib/types";

const SITE_URL = process.env.NEXTAUTH_URL || "https://noosho.com";

function parseJsonish<T>(v: unknown): T | null {
  if (!v) return null;
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as T;
    } catch {
      return null;
    }
  }
  return v as T;
}

// Stripe redirects here after payment. We verify the session synchronously,
// unlock the design, then redirect the user to the design page.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("session_id");
  const designId = searchParams.get("designId");

  if (!sessionId || !designId) {
    return NextResponse.redirect(`${SITE_URL}/create`);
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== "paid") {
      return NextResponse.redirect(`${SITE_URL}/create?payment=failed`);
    }

    const userId = session.metadata?.userId;
    if (userId) {
      await unlockDesign(designId, userId);

      // Fill in deferred hotspots now that the design is paid/entitled (P1-b).
      after(() => ensureHotspots(designId).catch(() => {}));

      // Record coupon usage on successful payment.
      const usedCoupon = session.metadata?.couponCode;
      if (usedCoupon) await incrementCouponUse(usedCoupon).catch(() => {});

      const design = await getDesign(designId);
      const cfg = parseJsonish<Record<string, string>>(design?.event_config);

      // Save event date for reminders if applicable
      if (design?.mode === "event" && cfg?.eventDate) {
        await saveEventDate({
          userId,
          eventType: cfg.eventType,
          eventLabel: cfg.honoree || cfg.eventLabel,
          eventDate: cfg.eventDate,
          honoree: cfg.honoree,
        }).catch(() => {});
      }

      // Now that they've paid, deliver the design + shopping list by email.
      if (design) {
        const authSession = await auth().catch(() => null);
        const to =
          authSession?.user?.email ||
          session.customer_details?.email ||
          session.customer_email ||
          undefined;
        if (to) {
          await sendDesignReadyEmail({
            to,
            name: authSession?.user?.name ?? undefined,
            designId,
            mode: design.mode === "event" ? "event" : "space",
            eventConfig: (cfg as unknown as EventConfig) ?? null,
            designNarrative: design.design_narrative || "",
            generatedImageUrl: design.generated_image_url,
            products: parseJsonish<ProductResult[]>(design.products) ?? [],
          }).catch((e) => console.error("[stripe/success] email failed:", e));
        }
      }
    }

    return NextResponse.redirect(`${SITE_URL}/design/${designId}?paid=1`);
  } catch (err) {
    console.error("[stripe/success]", err);
    return NextResponse.redirect(`${SITE_URL}/create?payment=error`);
  }
}
