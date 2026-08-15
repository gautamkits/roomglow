import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { sourceCategoryCandidates } from "@/lib/amazon";
import { localeFromRequest } from "@/lib/locale";
import type { ProductRecommendation } from "@/lib/types";
import { notifyAdminError } from "@/lib/email";
import { timed } from "@/lib/timing";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Please sign in to continue." }, { status: 401 });
    }

    const body = await request.json() as { products: ProductRecommendation[] };
    const { products } = body;
    if (!products?.length) {
      return NextResponse.json({ error: "No products" }, { status: 400 });
    }

    const locale = localeFromRequest(request);

    // Get top 5 candidates per category for AI curation. Retry/backoff and the
    // bare-category fallback both live in sourceCategoryCandidates so this path
    // and the restyle path in lib/regenerate.ts cannot drift apart.
    const categories = await timed(
      "search-products",
      () =>
        Promise.all(products.map((rec) => sourceCategoryCandidates(rec, locale, 5))),
      // These run in parallel, so total ms is the slowest category, not the sum
      // — a single retrying category sets the wall-clock for the whole step.
      { categories: products.length }
    );

    // A partial outage used to be completely silent: the request returned 200
    // with a category full of nothing, and no alert fired because nothing threw.
    const degraded = categories.filter((c) => c.status === "upstream_error");
    if (degraded.length) {
      await notifyAdminError({
        route: "search-products",
        error: new Error(
          `Amazon upstream unavailable for ${degraded.length}/${categories.length} categories`
        ),
        userId: session.user.id,
        userEmail: session.user.email ?? undefined,
        locale,
        extra: { categories: degraded.map((c) => c.category).join(", ") },
      });
    }

    return NextResponse.json({ categories, locale });
  } catch (error) {
    console.error("Product search failed:", error);
    await notifyAdminError({ route: "search-products", error });
    return NextResponse.json(
      { error: "Failed to search products" },
      { status: 500 }
    );
  }
}
