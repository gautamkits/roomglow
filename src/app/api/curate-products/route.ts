import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { curateProducts, type CategoryCandidates } from "@/lib/gemini";
import { notifyAdminError } from "@/lib/email";
import { timed } from "@/lib/timing";
import type { ProductResult, ProductMatchStatus } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Please sign in to continue." }, { status: 401 });
    }

    const { originalImage, designVision, categories, budgetInstruction } =
      (await request.json()) as {
        originalImage: string;
        designVision: string;
        categories: CategoryCandidates[];
        budgetInstruction?: string;
      };

    if (!originalImage || !categories?.length) {
      return NextResponse.json({ error: "Missing data" }, { status: 400 });
    }

    const base64 = originalImage.replace(/^data:image\/\w+;base64,/, "");
    const curationJson = await timed("curate-products", () =>
      curateProducts(base64, designVision, categories, budgetInstruction)
    );
    const curation = JSON.parse(curationJson);

    // Build the final list from the categories themselves, not from the model's
    // selections — a category the model forgot to return used to vanish silently,
    // and categories with no candidates never reach the model at all.
    const byCategory = new Map<
      number,
      { optionIndex: number; reason: string }
    >();
    for (const sel of (curation.selections || []) as {
      categoryIndex: number;
      optionIndex: number;
      reason: string;
    }[]) {
      if (!byCategory.has(sel.categoryIndex)) {
        byCategory.set(sel.categoryIndex, {
          optionIndex: sel.optionIndex,
          reason: sel.reason,
        });
      }
    }

    const selectedProducts: ProductResult[] = categories.map((cat, i) => {
      const sel = byCategory.get(i);
      const product =
        (sel ? cat.candidates[sel.optionIndex] : undefined) ??
        cat.candidates[0] ??
        null;
      const status: ProductMatchStatus = product
        ? "ok"
        : cat.status === "upstream_error"
          ? "upstream_error"
          : "no_results";
      return {
        recommendation: {
          category: cat.category,
          placement: cat.placement,
          // Only trust the model's reason when it actually picked a product;
          // otherwise it is text about a choice that was never offered.
          reason: product && sel ? sel.reason : cat.reason,
          colorSuggestion: cat.colorSuggestion,
          searchQuery: cat.searchQuery ?? "",
        },
        amazonProduct: product,
        matchStatus: status,
        searchUrl: cat.searchUrl,
      };
    });

    return NextResponse.json({
      products: selectedProducts,
      designNarrative: curation.designNarrative,
    });
  } catch (error) {
    console.error("Product curation failed:", error);
    await notifyAdminError({ route: "curate-products", error });
    return NextResponse.json(
      { error: "Failed to curate products" },
      { status: 500 }
    );
  }
}
