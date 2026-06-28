import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { stripe, STRIPE_PRICES } from "@/lib/stripe";
import { localeFromRequest, PAYMENT_ENABLED } from "@/lib/locale";
import { isAdminEmail } from "@/lib/admin";
import { getPricing, getCouponByCode, incrementCouponUse, unlockDesign, getDesign, recordCheckoutIntent } from "@/lib/db";
import { notifyAdminError } from "@/lib/email";
import { evaluateCoupon, type CouponRow } from "@/lib/coupons";
import { sendDesignReadyEmail } from "@/lib/email";
import type { EventConfig, ProductResult } from "@/lib/types";

const SITE_URL = process.env.NEXTAUTH_URL || "https://noosho.com";

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

    // Admin emails, or markets without payment enabled (India), unlock free.
    if (isAdminEmail(session.user.email) || !PAYMENT_ENABLED[locale]) {
      return NextResponse.json({ free: true });
    }

    // Resolve the current sale price from DB (fallback to hardcoded defaults).
    const pricing = await getPricing(locale);
    let amount = pricing?.sale_amount ?? STRIPE_PRICES[locale].amount;
    const currency = pricing?.currency ?? STRIPE_PRICES[locale].currency;

    // Apply coupon if provided + valid.
    let appliedCode: string | null = null;
    if (couponCode) {
      const coupon = (await getCouponByCode(couponCode)) as CouponRow | null;
      const result = evaluateCoupon(coupon, amount, locale);
      if (result.valid) {
        amount = result.finalAmount;
        appliedCode = String(couponCode).toUpperCase().trim();
      }
    }

    // Free after discount (100%-off coupon) → unlock directly, no Stripe, and
    // deliver the design email since they now own it.
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
        }).catch((e) => console.error("[checkout] free-unlock email failed:", e));
      }

      return NextResponse.json({ free: true });
    }

    const checkout = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: amount,
            product_data: {
              name: "Noosho design unlock",
              description: "Reveal your AI-generated room redesign with shoppable product links.",
            },
          },
        },
      ],
      metadata: { designId, userId: session.user.id, couponCode: appliedCode ?? "" },
      success_url: `${SITE_URL}/api/stripe/success?session_id={CHECKOUT_SESSION_ID}&designId=${designId}`,
      cancel_url: `${SITE_URL}/create`,
      customer_email: session.user.email ?? undefined,
    });

    // Record the intent so the abandoned-checkout funnel can follow up if they
    // don't complete payment. Non-fatal — never block checkout on this.
    if (session.user.email) {
      await recordCheckoutIntent({
        userId: session.user.id,
        designId,
        email: session.user.email,
        name: session.user.name ?? null,
        amount,
        currency,
      }).catch((e) => console.error("[checkout] recordCheckoutIntent failed:", e));
    }

    return NextResponse.json({ url: checkout.url });
  } catch (err) {
    console.error("[stripe/checkout]", err);
    await notifyAdminError({ route: "stripe/checkout", error: err });
    return NextResponse.json({ error: "Failed to create checkout" }, { status: 500 });
  }
}
