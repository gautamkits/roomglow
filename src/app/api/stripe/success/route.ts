import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { unlockDesign, getDesign, saveEventDate, incrementCouponUse } from "@/lib/db";

const SITE_URL = process.env.NEXTAUTH_URL || "https://noosho.com";

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

      // Record coupon usage on successful payment.
      const usedCoupon = session.metadata?.couponCode;
      if (usedCoupon) await incrementCouponUse(usedCoupon).catch(() => {});

      // Save event date for reminders if applicable
      const design = await getDesign(designId);
      if (design?.mode === "event" && design.event_config) {
        const cfg =
          typeof design.event_config === "string"
            ? JSON.parse(design.event_config)
            : design.event_config;
        if (cfg.eventDate) {
          await saveEventDate({
            userId,
            eventType: cfg.eventType,
            eventLabel: cfg.honoree || cfg.eventLabel,
            eventDate: cfg.eventDate,
            honoree: cfg.honoree,
          }).catch(() => {});
        }
      }
    }

    return NextResponse.redirect(`${SITE_URL}/design/${designId}?paid=1`);
  } catch (err) {
    console.error("[stripe/success]", err);
    return NextResponse.redirect(`${SITE_URL}/create?payment=error`);
  }
}
