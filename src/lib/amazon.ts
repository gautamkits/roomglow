const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY!;
const AFFILIATE_TAG = process.env.AMAZON_PARTNER_TAG || "yuaid-21";

export interface AmazonSearchResult {
  title: string;
  price: string;
  imageUrl: string;
  affiliateUrl: string;
  rating: number;
  asin: string;
}

export async function searchProducts(
  searchQuery: string,
  count: number = 5
): Promise<AmazonSearchResult[]> {
  try {
    const params = new URLSearchParams({
      query: searchQuery,
      page: "1",
      country: "IN",
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

    return products
      .filter((p: Record<string, string>) => p.product_photo && p.product_price)
      .slice(0, count)
      .map((item: Record<string, string>) => {
        const asin = item.asin || "";
        return {
          title: item.product_title || "Unknown Product",
          price: item.product_price || "Price unavailable",
          imageUrl: item.product_photo || "",
          affiliateUrl: asin
            ? `https://www.amazon.in/dp/${asin}?tag=${AFFILIATE_TAG}`
            : item.product_url || "",
          rating: parseFloat(item.product_star_rating) || 0,
          asin,
        };
      });
  } catch (error) {
    console.error("Amazon search failed:", error);
    return [];
  }
}
