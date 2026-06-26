import { NextResponse } from "next/server";
import { getPricing, getCouponByCode } from "@/lib/db";
import { evaluateCoupon, type CouponRow } from "@/lib/coupons";
import { localeFromRequest, formatAmount } from "@/lib/locale";

export async function POST(request: Request) {
  try {
    const { code } = await request.json();
    if (!code || typeof code !== "string") {
      return NextResponse.json({ valid: false, message: "Enter a coupon code" });
    }

    const locale = localeFromRequest(request);
    const pricing = await getPricing(locale);
    const base = pricing?.sale_amount ?? (locale === "US" ? 499 : 9900);
    const currency = pricing?.currency ?? (locale === "US" ? "usd" : "inr");

    const coupon = (await getCouponByCode(code)) as CouponRow | null;
    const result = evaluateCoupon(coupon, base, locale);

    return NextResponse.json({
      ...result,
      code: code.toUpperCase().trim(),
      currency,
      finalLabel: formatAmount(result.finalAmount, currency),
      discountLabel: formatAmount(result.discountAmount, currency),
    });
  } catch (err) {
    console.error("[validate-coupon]", err);
    return NextResponse.json({ valid: false, message: "Could not validate coupon" }, { status: 500 });
  }
}
