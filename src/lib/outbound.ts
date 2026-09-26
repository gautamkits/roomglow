// Single chokepoint for outbound affiliate links. Every affiliate URL rendered
// in the app must go through this so clicks pass through the /api/go redirect
// (302, noindex, nofollow) instead of exposing tagged amazon.* URLs to crawlers.
// New features just call outboundHref — the SEO policy is global by construction.

/**
 * Attribution for a click. Entirely optional — a call with no context still
 * produces a working link, it just logs less. The ASIN is NOT passed: /api/go
 * parses it out of the destination URL, so callers cannot get it wrong.
 */
export type OutboundContext = {
  /** The design the product was pinned on, when there is one. */
  designId?: string | null;
  /** Position in `designs.products` — the same index `Hotspot.productIndex` uses. */
  productIndex?: number | null;
  /** Product category, e.g. "Rug", so clicks can be grouped without a join. */
  category?: string | null;
  /** Which UI the click came from: "hotspot" | "sidebar" | "card" | "occasion" | "makeover". */
  surface?: string | null;
};

export function outboundHref(url: string, ctx?: OutboundContext): string {
  const params = new URLSearchParams({ u: url });
  if (ctx?.designId) params.set("d", ctx.designId);
  if (ctx?.productIndex != null) params.set("i", String(ctx.productIndex));
  if (ctx?.category) params.set("c", ctx.category);
  if (ctx?.surface) params.set("s", ctx.surface);
  return `/api/go?${params.toString()}`;
}
