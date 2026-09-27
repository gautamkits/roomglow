/**
 * Which prices the "Noosho explains" reel pins on the design: up to three of
 * the priciest pieces that sit apart (hotspot %s), so tags don't pile up. A
 * crowded room still gets 2–3, even if close together. Dependency-free: used by
 * the canvas scene and to time one "pop" sound per price.
 */
export type PricedSpot = { price: string; x?: number; y?: number };

export const amountOf = (price: string) => Number(price.replace(/[^\d.]/g, "")) || 0;

export function pickPrices<T extends PricedSpot>(products: T[]): T[] {
  const spotted = products.filter((p) => p.x != null && p.y != null).sort((a, b) => amountOf(b.price) - amountOf(a.price));
  const shown: T[] = [];
  for (const p of spotted) {
    if (shown.length >= 3) break;
    if (shown.every((q) => Math.hypot(q.x! - p.x!, q.y! - p.y!) > 12)) shown.push(p);
  }
  if (shown.length < 2) for (const p of spotted) if (shown.length < 3 && !shown.includes(p)) shown.push(p);
  return shown.length ? shown : products.slice(0, 2);
}

/** Scene timing shared by the canvas render and the SFX mix. */
export const PRICE_POP = { first: 0.15, step: 0.3 };
export const TOTAL_POP = 0.2; // after the last price
