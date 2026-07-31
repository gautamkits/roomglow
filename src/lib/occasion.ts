import type { Locale } from "@/lib/locale";
import type { OccasionProduct } from "@/lib/types";
import { getEvent } from "@/lib/events";
import { searchProducts } from "@/lib/amazon";

// In-memory cache so repeat views (results page, design page, other users on the
// same event/theme) don't re-hit RapidAPI. Best-effort, per serverless instance,
// resets on cold start — same simple Map-with-TTL approach as rateLimit.ts.
const TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map<string, { at: number; products: OccasionProduct[] }>();

/**
 * Occasion-specific complementary buyables for an event (gifts, treats, tableware…)
 * for the "Complete the occasion" grid. Runs the event's completionItems queries
 * against Amazon in parallel, dedupes by ASIN, caps the list. Returns [] for
 * unknown events or when Amazon yields nothing (the grid then renders nothing).
 */
export async function getCompletionProducts(
  eventId: string,
  locale: Locale,
  subTheme?: string
): Promise<OccasionProduct[]> {
  const event = getEvent(eventId);
  if (!event?.completionItems?.length) return [];

  const key = `${eventId}:${subTheme || ""}:${locale}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.products;

  // The render decorates walls, tables and the perimeter only — no ceiling
  // décor, no cake or food staging (that staging was removed in d5cf7a7) — so
  // this grid is where the cake, gifts, tableware and treats become buyable.
  // subTheme used to only enter the cache key — feeding it into the query keeps
  // the suggestions on-theme ("unicorn birthday cake topper", not a generic one).
  const theme = subTheme?.trim().toLowerCase();
  // Drop items that don't belong in this marketplace — an event can ship to both
  // markets while an individual buyable is market-specific.
  const items = event.completionItems.filter(
    (item) => !item.markets || item.markets.includes(locale)
  );
  const results = await Promise.all(
    items.map(async (item) => {
      const themed = theme ? `${theme} ${item.query}` : item.query;
      // Themed queries are narrower and can come back empty on a niche combo,
      // so fall back to the plain query rather than dropping the category.
      let found = await searchProducts(themed, 2, locale);
      if (!found.length && theme) found = await searchProducts(item.query, 2, locale);
      return found.map((p) => ({ ...p, category: item.category }));
    })
  );

  const seen = new Set<string>();
  const products: OccasionProduct[] = [];
  for (const p of results.flat()) {
    if (!p.asin || seen.has(p.asin)) continue;
    seen.add(p.asin);
    products.push(p);
    if (products.length >= 8) break;
  }

  cache.set(key, { at: Date.now(), products });
  return products;
}
