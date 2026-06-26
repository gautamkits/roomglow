import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { stripe, STRIPE_PRICES } from "@/lib/stripe";
import { localeFromRequest, PAYMENT_ENABLED } from "@/lib/locale";
import { isAdminEmail } from "@/lib/admin";
import { getPricing, getCouponByCode, incrementCouponUse, unlockDesign } from "@/lib/db";
import { evaluateCoupon, type CouponRow } from "@/lib/coupons";

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

    // Free after discount → unlock directly, no Stripe.
    if (amount <= 0) {
      await unlockDesign(designId, session.user.id);
      if (appliedCode) await incrementCouponUse(appliedCode).catch(() => {});
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

    return NextResponse.json({ url: checkout.url });
  } catch (err) {
    console.error("[stripe/checkout]", err);
    return NextResponse.json({ error: "Failed to create checkout" }, { status: 500 });
  }
}
