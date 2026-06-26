import { NextResponse } from "next/server";
import { getPricing } from "@/lib/db";
import { localeFromRequest, formatAmount } from "@/lib/locale";

// Public — returns the actual (MRP) and sale price for the visitor's locale.
export async function GET(request: Request) {
  const locale = localeFromRequest(request);
  const fallback = locale === "US"
    ? { actual: 499, sale: 499, currency: "usd" }
    : { actual: 9900, sale: 9900, currency: "inr" };

  try {
    const p = await getPricing(locale);
    const actual = p?.actual_amount ?? fallback.actual;
    const sale = p?.sale_amount ?? fallback.sale;
    const currency = p?.currency ?? fallback.currency;
    return NextResponse.json({
      locale,
      currency,
      actualAmount: actual,
      saleAmount: sale,
      actualLabel: formatAmount(actual, currency),
      saleLabel: formatAmount(sale, currency),
      hasDiscount: actual > sale,
    });
  } catch {
    return NextResponse.json({
      locale,
      currency: fallback.currency,
      actualAmount: fallback.actual,
      saleAmount: fallback.sale,
      actualLabel: formatAmount(fallback.actual, fallback.currency),
      saleLabel: formatAmount(fallback.sale, fallback.currency),
      hasDiscount: false,
    });
  }
}
