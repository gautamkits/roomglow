export interface CouponRow {
  code: string;
  discount_type: string; // "percent" | "fixed"
  discount_value: number; // percent (1-100) or fixed amount in smallest unit
  locale: string | null; // null = all regions
  active: boolean;
  expires_at: string | null;
  max_uses: number | null;
  used_count: number;
}

export interface CouponResult {
  valid: boolean;
  message?: string;
  discountAmount: number; // in smallest unit
  finalAmount: number; // in smallest unit
}

/** Pure discount evaluation — no DB access, shared by validate + checkout. */
export function evaluateCoupon(
  coupon: CouponRow | null,
  baseAmount: number,
  locale: string
): CouponResult {
  const fail = (message: string): CouponResult => ({
    valid: false,
    message,
    discountAmount: 0,
    finalAmount: baseAmount,
  });

  if (!coupon) return fail("Invalid coupon code");
  if (!coupon.active) return fail("This coupon is no longer active");
  if (coupon.expires_at && new Date(coupon.expires_at) < new Date())
    return fail("This coupon has expired");
  if (coupon.max_uses != null && coupon.used_count >= coupon.max_uses)
    return fail("This coupon has reached its usage limit");
  if (coupon.locale && coupon.locale !== locale)
    return fail("This coupon isn't valid in your region");

  let discount =
    coupon.discount_type === "percent"
      ? Math.round((baseAmount * coupon.discount_value) / 100)
      : coupon.discount_value;
  discount = Math.max(0, Math.min(discount, baseAmount));

  return {
    valid: true,
    discountAmount: discount,
    finalAmount: baseAmount - discount,
  };
}
