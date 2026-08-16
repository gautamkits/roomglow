import type { ProductResult } from "@/lib/types";

/**
 * Totalling a design's products, in one place.
 *
 * This logic used to live inline in ImageWithHotspots with `parsePrice`
 * duplicated in budget.ts and the same locale formatting written a third time
 * in `budgetSentence`. The reveal-video export needs the same number, and three
 * copies drifting apart would mean the marketing video quoting a different
 * price from the design page it links to.
 *
 * NOT `formatAmount` from lib/locale: that takes minor units (paise/cents) for
 * DB pricing rows and would divide an Amazon-price sum by 100.
 */

/** Amazon price strings are display text ("₹2,999", "$329.99"), not numbers. */
export function parsePrice(s?: string): number {
  if (!s) return 0;
  const v = parseFloat(s.replace(/[^0-9.]/g, ""));
  return isNaN(v) ? 0 : v;
}

// Pull the currency symbol straight from an Amazon price string ("$329.99",
// "₹2,999") so the total always matches the marketplace the products came from.
export function currencyOf(prices: (string | undefined)[]): string {
  for (const p of prices) {
    const m = p?.match(/[^\d.,\s]+/);
    if (m) return m[0];
  }
  return "₹";
}

export function formatTotal(n: number, symbol: string): string {
  return (
    symbol +
    n.toLocaleString(symbol === "$" ? "en-US" : "en-IN", {
      maximumFractionDigits: symbol === "$" ? 2 : 0,
    })
  );
}

export interface DesignTotal {
  /** Summed major-unit value of every priced product. */
  total: number;
  /** Ready-to-render string, e.g. "₹12,499". */
  formatted: string;
  /** Currency symbol sniffed from the product prices. */
  currency: string;
  /** How many products contributed a real price. */
  priced: number;
  /**
   * True when at least one matched product had no parseable price, so the
   * total is a floor rather than the real basket cost. Callers putting this in
   * front of a buyer should say "from ₹X" — the old inline version counted an
   * unparseable price as 0 and quoted the short number as if it were exact.
   */
  partial: boolean;
}

/**
 * Total for a design's products, or `null` when nothing is priceable — so a
 * caller renders no price at all rather than a confident "₹0".
 */
export function designTotal(products: ProductResult[]): DesignTotal | null {
  const matched = products.filter((p) => p.amazonProduct);
  const prices = matched.map((p) => p.amazonProduct?.price);
  const priced = prices.filter((p) => parsePrice(p) > 0);
  if (!priced.length) return null;

  const total = priced.reduce((sum, p) => sum + parsePrice(p), 0);
  const currency = currencyOf(prices);
  return {
    total,
    formatted: formatTotal(total, currency),
    currency,
    priced: priced.length,
    partial: priced.length < matched.length,
  };
}
