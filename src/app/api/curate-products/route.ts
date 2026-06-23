import { NextResponse } from "next/server";
import { curateProducts, type CategoryCandidates } from "@/lib/gemini";

export async function POST(request: Request) {
  try {
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
    const curationJson = await curateProducts(
      base64,
      designVision,
      categories,
      budgetInstruction
    );
    const curation = JSON.parse(curationJson);

    // Build final product list from AI selections (guard against bad indices)
    const selectedProducts = (curation.selections || [])
      .map((sel: { categoryIndex: number; optionIndex: number; reason: string }) => {
        const cat = categories[sel.categoryIndex];
        if (!cat) return null;
        const product = cat.candidates[sel.optionIndex] ?? cat.candidates[0] ?? null;
        return {
          recommendation: {
            category: cat.category,
            placement: cat.placement,
            reason: sel.reason,
            colorSuggestion: cat.colorSuggestion,
            searchQuery: "",
          },
          amazonProduct: product,
        };
      })
      .filter(Boolean);

    return NextResponse.json({
      products: selectedProducts,
      designNarrative: curation.designNarrative,
    });
  } catch (error) {
    console.error("Product curation failed:", error);
    return NextResponse.json(
      { error: "Failed to curate products" },
      { status: 500 }
    );
  }
}
