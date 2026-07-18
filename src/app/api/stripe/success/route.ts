import { NextResponse, after } from "next/server";
import { auth } from "@/auth";
import { stripe } from "@/lib/stripe";
import { sendMetaEvent, metaContextFromRequest } from "@/lib/meta";
import { unlockDesign, getDesign, saveEventDate, incrementCouponUse, recordStripeSale } from "@/lib/db";
import { sendDesignReadyEmail, notifyAdminError } from "@/lib/email";
import { onDesignUnlocked } from "@/lib/unlock";
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

      // Record the sale for analytics (idempotent on the Stripe session id).
      if (session.amount_total != null) {
        await recordStripeSale({
          userId,
          designId,
          amount: session.amount_total,
          currency: session.currency || "usd",
          stripeSessionId: session.id,
        }).catch((e) => console.error("[stripe/success] recordSale failed:", e));
      }

      // Fill in deferred hotspots now that the design is paid/entitled (P1-b).
      onDesignUnlocked(designId);

      // Server-side Purchase → Meta CAPI. event_id = Stripe session id (unique +
      // idempotent). amount_total is in minor units (cents), Meta wants major.
      const metaCtx = metaContextFromRequest(request);
      after(() =>
        sendMetaEvent({
          eventName: "Purchase",
          eventId: session.id,
          email: session.customer_details?.email || session.customer_email,
          externalId: userId,
          value: session.amount_total != null ? session.amount_total / 100 : undefined,
          currency: session.currency || "USD",
          customData: { content_ids: [designId], content_type: "product" },
          context: metaCtx,
        })
      );

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
    await notifyAdminError({ route: "stripe/success", error: err });
    return NextResponse.redirect(`${SITE_URL}/create?payment=error`);
  }
}
