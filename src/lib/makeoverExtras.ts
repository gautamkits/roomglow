import type { Locale } from "@/lib/locale";
import type { OccasionProduct } from "@/lib/types";
import { getMakeoverStyle } from "@/lib/makeover";
import { searchProducts } from "@/lib/amazon";

// In-memory cache (per serverless instance, 24h TTL) so repeat views of the
// "Complete the look" grid don't re-hit RapidAPI — same pattern as occasion.ts.
const TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map<string, { at: number; products: OccasionProduct[] }>();

/**
 * Complementary fashion accessories for a makeover style (watch, bag, fragrance,
 * sunglasses…) for the async "Complete the look" grid. Runs the style's `extras`
 * queries against Amazon in parallel, dedupes by ASIN, caps at 8. Returns [] for
 * unknown styles or when Amazon yields nothing.
 */
export async function getMakeoverExtras(
  styleId: string,
  locale: Locale
): Promise<OccasionProduct[]> {
  const style = getMakeoverStyle(styleId);
  if (!style?.extras?.length) return [];

  const key = `makeover:${styleId}:${locale}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.products;

  const results = await Promise.all(
    style.extras.map(async (item) => {
      const found = await searchProducts(item.query, 2, locale);
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
