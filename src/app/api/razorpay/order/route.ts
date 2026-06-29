import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createOrder } from "@/lib/razorpay";
import { localeFromRequest, PAYMENT_ENABLED } from "@/lib/locale";
import { isAdminEmail } from "@/lib/admin";
import {
  getPricing,
  getCouponByCode,
  unlockDesign,
  getDesign,
  incrementCouponUse,
  recordCheckoutIntent,
} from "@/lib/db";
import { sendDesignReadyEmail, notifyAdminError } from "@/lib/email";
import { evaluateCoupon, type CouponRow } from "@/lib/coupons";
import type { EventConfig, ProductResult } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Sign in first" }, { status: 401 });
    }

    const { designId, couponCode } = await request.json();
    if (!designId) {
      return NextResponse.json({ error: "Missing designId" }, { status: 400 });
    }

    const locale = localeFromRequest(request);

    if (isAdminEmail(session.user.email) || !PAYMENT_ENABLED[locale]) {
      return NextResponse.json({ free: true });
    }

    if (locale !== "IN") {
      return NextResponse.json({ error: "Use Stripe for this region" }, { status: 400 });
    }

    const pricing = await getPricing(locale);
    let amount = pricing?.sale_amount ?? 9900;
    const currency = (pricing?.currency ?? "inr").toUpperCase();

    let appliedCode: string | null = null;
    if (couponCode) {
      const coupon = (await getCouponByCode(couponCode)) as CouponRow | null;
      const result = evaluateCoupon(coupon, amount, locale);
      if (result.valid) {
        amount = result.finalAmount;
        appliedCode = String(couponCode).toUpperCase().trim();
      }
    }

    // 100%-off coupon → free unlock
    if (amount <= 0) {
      await unlockDesign(designId, session.user.id);
      if (appliedCode) await incrementCouponUse(appliedCode).catch(() => {});

      const design = await getDesign(designId);
      if (design && session.user.email) {
        const cfg =
          typeof design.event_config === "string"
            ? JSON.parse(design.event_config)
            : design.event_config;
        await sendDesignReadyEmail({
          to: session.user.email,
          name: session.user.name ?? undefined,
          designId,
          mode: design.mode === "event" ? "event" : "space",
          eventConfig: (cfg as EventConfig) ?? null,
          designNarrative: design.design_narrative || "",
          generatedImageUrl: design.generated_image_url,
          products: (design.products as ProductResult[]) ?? [],
        }).catch(() => {});
      }

      return NextResponse.json({ free: true });
    }

    const receipt = `noosho_${designId.slice(0, 8)}_${Date.now()}`;
    const order = await createOrder({
      amount,
      currency,
      receipt,
      notes: {
        designId,
        userId: session.user.id,
        couponCode: appliedCode ?? "",
        amount: String(amount),
      },
    });

    if (session.user.email) {
      await recordCheckoutIntent({
        userId: session.user.id,
        designId,
        email: session.user.email,
        name: session.user.name ?? null,
        amount,
        currency: currency.toLowerCase(),
      }).catch(() => {});
    }

    return NextResponse.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
      couponCode: appliedCode,
    });
  } catch (err) {
    console.error("[razorpay/order]", err);
    await notifyAdminError({ route: "razorpay/order", error: err });
    return NextResponse.json({ error: "Failed to create order" }, { status: 500 });
  }
}
