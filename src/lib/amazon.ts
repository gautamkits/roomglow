import { type Locale, AFFILIATE_TAGS, AMAZON_DOMAINS } from "@/lib/locale";

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY!;

/** Attempts per query, including the first. Upstream (RapidAPI
 *  `real-time-amazon-data`) returns sporadic 503 `temp_error` responses that
 *  succeed on an immediate re-issue; without this a blip silently produced a
 *  product row with no buyable match. */
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 300;
const ATTEMPT_TIMEOUT_MS = 8000;

export interface AmazonSearchResult {
  title: string;
  price: string;
  imageUrl: string;
  affiliateUrl: string;
  rating: number;
  asin: string;
}

export type AmazonSearchStatus = "ok" | "no_results" | "upstream_error";

export interface AmazonSearchOutcome {
  results: AmazonSearchResult[];
  /** Distinguishes "upstream is broken" from "upstream answered, nothing matched".
   *  Collapsing both into an empty array is what made a 503 indistinguishable
   *  from a genuinely unmatchable query. */
  status: AmazonSearchStatus;
  /** Products returned before the photo/price filter — a large rawCount with an
   *  empty `results` means the filter, not the query, emptied the category. */
  rawCount: number;
  /** Upstream HTTP status of the final attempt, when it failed. */
  httpStatus?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 429 and 5xx are worth re-issuing; other 4xx (401 bad key, 403 quota) are not
 *  — retrying those only burns latency on a request that cannot succeed. */
function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * Search Amazon via RapidAPI, retrying transient failures with backoff.
 *
 * Returns an outcome rather than a bare array so callers can tell an upstream
 * outage apart from a legitimately empty result set.
 */
export async function searchProductsDetailed(
  searchQuery: string,
  count: number = 5,
  locale: Locale = "IN"
): Promise<AmazonSearchOutcome> {
  const params = new URLSearchParams({
    query: searchQuery,
    page: "1",
    country: locale,
    sort_by: "RELEVANCE",
    product_condition: "ALL",
    is_prime: "false",
    deals_and_discounts: "NONE",
  });

  let lastHttpStatus: number | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(
        `https://real-time-amazon-data.p.rapidapi.com/search?${params}`,
        {
          headers: {
            "Content-Type": "application/json",
            "x-rapidapi-host": "real-time-amazon-data.p.rapidapi.com",
            "x-rapidapi-key": RAPIDAPI_KEY,
          },
          signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
        }
      );

      if (!response.ok) {
        lastHttpStatus = response.status;
        const body = await response.text();
        console.error(
          `Amazon API error: ${response.status} (attempt ${attempt}/${MAX_ATTEMPTS}, query "${searchQuery}") ${body}`
        );
        if (isRetryableStatus(response.status) && attempt < MAX_ATTEMPTS) {
          await sleep(backoffMs(attempt));
          continue;
        }
        return { results: [], status: "upstream_error", rawCount: 0, httpStatus: response.status };
      }

      const data = await response.json();
      const products = data.data?.products;
      const rawCount = Array.isArray(products) ? products.length : 0;
      if (!rawCount) {
        return { results: [], status: "no_results", rawCount: 0 };
      }

      const tag = AFFILIATE_TAGS[locale];
      const domain = AMAZON_DOMAINS[locale];

      const results: AmazonSearchResult[] = products
        .filter((p: Record<string, string>) => p.product_photo && p.product_price)
        .slice(0, count)
        .map((item: Record<string, string>) => {
          const asin = item.asin || "";
          return {
            title: item.product_title || "Unknown Product",
            price: item.product_price || "Price unavailable",
            imageUrl: item.product_photo || "",
            affiliateUrl: asin
              ? `https://www.${domain}/dp/${asin}?tag=${tag}`
              : item.product_url || "",
            rating: parseFloat(item.product_star_rating) || 0,
            asin,
          };
        });

      // Second, previously invisible way a category goes empty: upstream had
      // matches but every one of them lacked a photo or a price.
      if (!results.length) {
        console.warn(
          `Amazon search "${searchQuery}": ${rawCount} raw results, 0 usable after photo/price filter`
        );
      }

      return {
        results,
        status: results.length ? "ok" : "no_results",
        rawCount,
      };
    } catch (error) {
      // Network failure or per-attempt timeout — both retryable.
      console.error(
        `Amazon search failed (attempt ${attempt}/${MAX_ATTEMPTS}, query "${searchQuery}"):`,
        error
      );
      if (attempt < MAX_ATTEMPTS) {
        await sleep(backoffMs(attempt));
        continue;
      }
      return { results: [], status: "upstream_error", rawCount: 0, httpStatus: lastHttpStatus };
    }
  }

  return { results: [], status: "upstream_error", rawCount: 0, httpStatus: lastHttpStatus };
}

/** ~300ms, ~900ms, with jitter so concurrent category searches don't retry in lockstep. */
function backoffMs(attempt: number): number {
  return BASE_BACKOFF_MS * Math.pow(3, attempt - 1) + Math.random() * 150;
}

/** Back-compatible wrapper for callers that only care about the products
 *  (occasion grid, makeover extras) and treat any failure as "show nothing". */
export async function searchProducts(
  searchQuery: string,
  count: number = 5,
  locale: Locale = "IN"
): Promise<AmazonSearchResult[]> {
  const { results } = await searchProductsDetailed(searchQuery, count, locale);
  return results;
}

export interface SourcedCategory {
  category: string;
  placement: string;
  reason: string;
  colorSuggestion: string;
  searchQuery: string;
  /** Tagged Amazon search URL, used as the user-facing fallback when we have no
   *  specific product to link to. Built here because affiliate tags are
   *  server-only. */
  searchUrl: string;
  candidates: AmazonSearchResult[];
  status: AmazonSearchStatus;
}

/**
 * Source up to `count` candidates for one recommendation.
 *
 * Falls back to the bare category name only when the specific query succeeded
 * and simply found nothing — a failing upstream has already been retried inside
 * `searchProductsDetailed`, so re-querying it just multiplies the same error.
 */
export async function sourceCategoryCandidates(
  rec: {
    category: string;
    searchQuery: string;
    placement: string;
    reason: string;
    colorSuggestion: string;
  },
  locale: Locale,
  count: number = 5
): Promise<SourcedCategory> {
  let outcome = await searchProductsDetailed(rec.searchQuery, count, locale);
  let usedFallbackQuery = false;

  if (outcome.status === "no_results" && rec.category !== rec.searchQuery) {
    usedFallbackQuery = true;
    outcome = await searchProductsDetailed(rec.category, count, locale);
  }

  // One structured line per category: a silent zero used to leave no trace at all.
  console.log(
    JSON.stringify({
      tag: "amazon_category",
      category: rec.category,
      query: rec.searchQuery,
      usedFallbackQuery,
      rawCount: outcome.rawCount,
      finalCount: outcome.results.length,
      status: outcome.status,
      httpStatus: outcome.httpStatus,
      locale,
    })
  );

  return {
    category: rec.category,
    placement: rec.placement,
    reason: rec.reason,
    colorSuggestion: rec.colorSuggestion,
    searchQuery: rec.searchQuery,
    searchUrl: amazonSearchUrl(rec.searchQuery, locale),
    candidates: outcome.results,
    status: outcome.status,
  };
}

/** Tagged Amazon search-results URL for a query. */
export function amazonSearchUrl(query: string, locale: Locale): string {
  return `https://www.${AMAZON_DOMAINS[locale]}/s?k=${encodeURIComponent(query)}&tag=${AFFILIATE_TAGS[locale]}`;
}
