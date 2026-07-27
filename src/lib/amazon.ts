import { type Locale, AFFILIATE_TAGS, AMAZON_DOMAINS } from "@/lib/locale";

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY!;

export interface AmazonSearchResult {
  title: string;
  price: string;
  imageUrl: string;
  affiliateUrl: string;
  rating: number;
  asin: string;
  // Quality signals the search endpoint already returns. Used to rank
  // candidates before curation, and shown to the curator so it can weigh
  // social proof alongside how the product looks.
  numRatings?: number;
  isBestSeller?: boolean;
  isAmazonChoice?: boolean;
  salesVolume?: string;
}

/**
 * Amazon media URLs encode the rendered size in a token before the extension
 * (e.g. `._AC_UL960_QL65_.jpg` = 960px at quality level 65). Swapping it for
 * `_SL1600_` returns the full-quality 1600px render — ~2.5x the image data.
 *
 * Only use this for images we feed to the image model as visual references;
 * product cards keep the smaller URL so the gallery stays fast.
 */
export function hiResImageUrl(url: string): string {
  if (!url) return url;
  return url.replace(/\._[A-Z0-9_,]+_\.(jpg|jpeg|png|webp)$/i, "._SL1600_.$1");
}

/**
 * Fetch a product image at full resolution, falling back to the original URL
 * if the upsized variant isn't served. Losing the reference image entirely
 * would drop that product to a text-only description in the render prompt,
 * which is a much worse outcome than a smaller image.
 */
export async function fetchProductImage(
  url: string | undefined
): Promise<{ data: string; mimeType: string } | null> {
  if (!url) return null;
  const candidates = [hiResImageUrl(url), url].filter(
    (u, i, a) => a.indexOf(u) === i
  );
  for (const candidate of candidates) {
    try {
      const res = await fetch(candidate);
      if (!res.ok) continue;
      const buffer = await res.arrayBuffer();
      return {
        data: Buffer.from(buffer).toString("base64"),
        mimeType: res.headers.get("content-type") || "image/jpeg",
      };
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}

/** Raw shape of a product row from the RapidAPI search endpoint. */
interface RawAmazonProduct {
  asin?: string;
  product_title?: string;
  product_price?: string;
  product_photo?: string;
  product_url?: string;
  product_star_rating?: string;
  product_num_ratings?: number;
  is_best_seller?: boolean;
  is_amazon_choice?: boolean;
  sales_volume?: string;
}

// Progressive quality bars. The search endpoint returns ~48 rows, so we can
// afford to be picky; if a niche query (e.g. "annaprasan backdrop") can't fill
// `count` at one bar we drop to the next. The last tier is unfiltered, which
// reproduces the old take-whatever-came-first behaviour rather than failing.
const QUALITY_TIERS = [
  { minRating: 4.0, minReviews: 50 },
  { minRating: 3.8, minReviews: 20 },
  { minRating: 3.5, minReviews: 5 },
  { minRating: 0, minReviews: 0 },
];

/**
 * Bayesian-adjusted rating plus small bonuses for Amazon's own badges.
 *
 * A raw star rating is a trap at low volume — 5.0 from 2 reviews is not better
 * than 4.3 from 5,000. Pulling each rating toward a prior in proportion to how
 * few reviews back it fixes that ordering.
 */
function qualityScore(p: RawAmazonProduct): number {
  const rating = parseFloat(p.product_star_rating ?? "") || 0;
  const n = p.product_num_ratings ?? 0;
  const PRIOR_WEIGHT = 50;
  const PRIOR_RATING = 3.9;
  let score =
    (rating * n + PRIOR_RATING * PRIOR_WEIGHT) / (n + PRIOR_WEIGHT);

  if (p.is_best_seller) score += 0.25;
  if (p.is_amazon_choice) score += 0.15;

  // "200+ bought in past month" — recent demand, worth a nudge but not a lot.
  const bought = parseInt(String(p.sales_volume ?? "").replace(/[^0-9]/g, ""), 10);
  if (bought > 0) score += Math.min(0.2, Math.log10(bought) / 25);

  return score;
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

    const usable: RawAmazonProduct[] = (products as RawAmazonProduct[]).filter(
      (p) => p.product_photo && p.product_price
    );

    // Pick the strictest quality bar that can still fill the slate, then rank
    // what's left. Previously we took the first `count` by relevance, which
    // ignored ratings entirely even though they were right there in the row.
    const tier =
      QUALITY_TIERS.find(
        (t) =>
          usable.filter(
            (p) =>
              (parseFloat(p.product_star_rating ?? "") || 0) >= t.minRating &&
              (p.product_num_ratings ?? 0) >= t.minReviews
          ).length >= count
      ) ?? QUALITY_TIERS[QUALITY_TIERS.length - 1];

    return usable
      .filter(
        (p) =>
          (parseFloat(p.product_star_rating ?? "") || 0) >= tier.minRating &&
          (p.product_num_ratings ?? 0) >= tier.minReviews
      )
      .sort((a, b) => qualityScore(b) - qualityScore(a))
      .slice(0, count)
      .map((item) => {
        const asin = item.asin || "";
        return {
          title: item.product_title || "Unknown Product",
          price: item.product_price || "Price unavailable",
          imageUrl: item.product_photo || "",
          affiliateUrl: asin
            ? `https://www.${domain}/dp/${asin}?tag=${tag}`
            : item.product_url || "",
          rating: parseFloat(item.product_star_rating ?? "") || 0,
          asin,
          numRatings: item.product_num_ratings ?? 0,
          isBestSeller: !!item.is_best_seller,
          isAmazonChoice: !!item.is_amazon_choice,
          salesVolume: item.sales_volume || undefined,
        };
      });
  } catch (error) {
    console.error("Amazon search failed:", error);
    return [];
  }
}
