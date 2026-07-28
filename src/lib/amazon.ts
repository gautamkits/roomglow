import { type Locale, AFFILIATE_TAGS, AMAZON_DOMAINS } from "@/lib/locale";

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY!;

export interface AmazonSearchResult {
  title: string;
  price: string;
  imageUrl: string;
  affiliateUrl: string;
  rating: number;
  asin: string;
  /** Number of ratings. A 5.0 from 3 reviews is not a 5.0 — used for ranking. */
  ratingCount?: number;
}

/**
 * Rank a candidate on review evidence, not raw Amazon relevance order.
 *
 * Amazon's first result can be a sponsored 3-review listing, and whichever SKU
 * wins becomes the reference photo the renderer copies from — so a weak listing
 * degrades the design, not just the shopping links.
 *
 * Bayesian average: shrink each rating toward a typical-listing prior in
 * proportion to how little evidence backs it. A thin 5.0 lands near the prior
 * instead of on top, a well-reviewed 4.3 holds its ground, and — unlike simple
 * volume damping — a *confidently bad* 2.4 with 500 reviews correctly sinks
 * below an unrated listing rather than being lifted by its review count.
 */
const PRIOR_RATING = 4.0; // roughly the average Amazon listing
const PRIOR_WEIGHT = 30; // reviews' worth of scepticism applied to every listing

function qualityScore(p: Record<string, unknown>): number {
  const rating = parseFloat(String(p.product_star_rating ?? "")) || 0;
  const count = parseInt(String(p.product_num_ratings ?? "0").replace(/\D/g, ""), 10) || 0;
  const bayesian =
    (PRIOR_RATING * PRIOR_WEIGHT + rating * count) / (PRIOR_WEIGHT + count);
  const badge = (p.is_best_seller ? 0.35 : 0) + (p.is_amazon_choice ? 0.25 : 0);
  return bayesian + badge;
}

export async function searchProducts(
  searchQuery: string,
  count: number = 5,
  locale: Locale = "IN"
): Promise<AmazonSearchResult[]> {
  try {
    const params = new URLSearchParams({
      query: searchQuery,
      page: "1",
      country: locale,
      sort_by: "RELEVANCE",
      product_condition: "ALL",
      is_prime: "false",
      deals_and_discounts: "NONE",
    });

    const response = await fetch(
      `https://real-time-amazon-data.p.rapidapi.com/search?${params}`,
      {
        headers: {
          "Content-Type": "application/json",
          "x-rapidapi-host": "real-time-amazon-data.p.rapidapi.com",
          "x-rapidapi-key": RAPIDAPI_KEY,
        },
      }
    );

    if (!response.ok) {
      console.error("Amazon API error:", response.status, await response.text());
      return [];
    }

    const data = await response.json();
    const products = data.data?.products;
    if (!products?.length) return [];

    const tag = AFFILIATE_TAGS[locale];
    const domain = AMAZON_DOMAINS[locale];

    // Rank the whole relevance-matched page by review evidence before taking
    // the top `count`, rather than blindly trusting Amazon's first N (which can
    // be sponsored, thinly-reviewed listings). Array.sort is stable, so when
    // nothing has ratings the original relevance order survives untouched.
    return products
      .filter((p: Record<string, string>) => p.product_photo && p.product_price)
      .map((item: Record<string, string>) => ({ item, score: qualityScore(item) }))
      .sort((a: { score: number }, b: { score: number }) => b.score - a.score)
      .slice(0, count)
      .map(({ item }: { item: Record<string, string> }) => {
        const asin = item.asin || "";
        return {
          title: item.product_title || "Unknown Product",
          price: item.product_price || "Price unavailable",
          imageUrl: item.product_photo || "",
          affiliateUrl: asin
            ? `https://www.${domain}/dp/${asin}?tag=${tag}`
            : item.product_url || "",
          rating: parseFloat(item.product_star_rating) || 0,
          ratingCount:
            parseInt(String(item.product_num_ratings ?? "0").replace(/\D/g, ""), 10) || 0,
          asin,
        };
      });
  } catch (error) {
    console.error("Amazon search failed:", error);
    return [];
  }
}
