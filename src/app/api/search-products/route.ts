import { NextResponse } from "next/server";
import { searchProducts } from "@/lib/amazon";
import { localeFromRequest } from "@/lib/locale";
import type { ProductRecommendation } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { products: ProductRecommendation[] };
    const { products } = body;
    if (!products?.length) {
      return NextResponse.json({ error: "No products" }, { status: 400 });
    }

    const locale = localeFromRequest(request);

    // Get top 5 candidates per category for AI curation
    const categories = await Promise.all(
      products.map(async (rec) => {
        let candidates = await searchProducts(rec.searchQuery, 5, locale);
        // Retry with simpler query if no results
        if (candidates.length === 0) {
          candidates = await searchProducts(rec.category, 5, locale);
        }
        return {
          category: rec.category,
          placement: rec.placement,
          reason: rec.reason,
          colorSuggestion: rec.colorSuggestion,
          candidates,
        };
      })
    );

    return NextResponse.json({ categories, locale });
  } catch (error) {
    console.error("Product search failed:", error);
    return NextResponse.json(
      { error: "Failed to search products" },
      { status: 500 }
    );
  }
}
