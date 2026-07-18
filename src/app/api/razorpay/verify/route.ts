import { NextResponse, after } from "next/server";
import { auth } from "@/auth";
import { verifyPaymentSignature } from "@/lib/razorpay";
import { sendMetaEvent, metaContextFromRequest } from "@/lib/meta";
import {
  unlockDesign,
  getDesign,
  saveEventDate,
  incrementCouponUse,
  recordStripeSale,
} from "@/lib/db";
import { sendDesignReadyEmail, notifyAdminError } from "@/lib/email";
import { onDesignUnlocked } from "@/lib/unlock";
import type { EventConfig, ProductResult } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      designId,
      couponCode,
      amount,
      currency,
    } = await request.json();

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !designId) {
      return NextResponse.json({ error: "Missing payment data" }, { status: 400 });
    }

    const valid = verifyPaymentSignature({
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature,
    });

    if (!valid) {
      console.warn("[razorpay/verify] invalid signature", {
        razorpay_order_id,
        razorpay_payment_id,
      });
      return NextResponse.json({ error: "Invalid payment signature" }, { status: 400 });
    }

    await unlockDesign(designId, session.user.id);

    if (amount != null) {
      await recordStripeSale({
        userId: session.user.id,
        designId,
        amount,
        currency: (currency ?? "inr").toLowerCase(),
        stripeSessionId: razorpay_payment_id,
      }).catch((e) => console.error("[razorpay/verify] recordSale failed:", e));
    }

    if (couponCode) {
      await incrementCouponUse(String(couponCode).toUpperCase().trim()).catch(() => {});
    }

    onDesignUnlocked(designId);

    // Server-side Purchase → Meta CAPI. Most reliable purchase signal for the
    // India funnel. event_id = payment id (unique + idempotent). Value is sent
    // in major units (rupees), so divide the minor-unit amount by 100.
    const metaCtx = metaContextFromRequest(request);
    after(() =>
      sendMetaEvent({
        eventName: "Purchase",
        eventId: razorpay_payment_id,
        email: session.user?.email,
        externalId: session.user?.id,
        value: amount != null ? Number(amount) / 100 : undefined,
        currency: currency ?? "INR",
        customData: { content_ids: [designId], content_type: "product" },
        context: metaCtx,
      })
    );

    const design = await getDesign(designId);
    if (design) {
      const cfg =
        typeof design.event_config === "string"
          ? JSON.parse(design.event_config)
          : design.event_config;

      if (design.mode === "event" && cfg?.eventDate) {
        await saveEventDate({
          userId: session.user.id,
          eventType: cfg.eventType,
          eventLabel: cfg.eventLabel,
          eventDate: cfg.eventDate,
          honoree: cfg.honoree,
        }).catch(() => {});
      }

      if (session.user.email) {
        await sendDesignReadyEmail({
          to: session.user.email,
          name: session.user.name ?? undefined,
          designId,
          mode: design.mode === "event" ? "event" : "space",
          eventConfig: (cfg as EventConfig) ?? null,
          designNarrative: design.design_narrative || "",
          generatedImageUrl: design.generated_image_url,
          products: (design.products as ProductResult[]) ?? [],
        }).catch((e) => console.error("[razorpay/verify] email failed:", e));
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[razorpay/verify]", err);
    await notifyAdminError({ route: "razorpay/verify", error: err });
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}
