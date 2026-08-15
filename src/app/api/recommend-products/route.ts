import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { recommendProducts } from "@/lib/gemini";
import { localeFromRequest } from "@/lib/locale";
import { notifyAdminError } from "@/lib/email";
import { timed } from "@/lib/timing";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Please sign in to continue." }, { status: 401 });
    }

    const {
      roomAnalysis,
      userAnswers,
      selectedProductTypes,
      eventContext,
      removeLabels,
      autoCleared,
    } = await request.json();
    if (!roomAnalysis || !userAnswers) {
      return NextResponse.json({ error: "Missing data" }, { status: 400 });
    }

    // Same locale the downstream /api/search-products call uses, so the query
    // wording matches the marketplace it will actually be searched against.
    const recommendationsJson = await timed("recommend-products", () =>
      recommendProducts(
        roomAnalysis,
        userAnswers,
        selectedProductTypes || [],
        eventContext,
        Array.isArray(removeLabels) ? removeLabels : [],
        localeFromRequest(request),
        !!autoCleared
      )
    );
    const recommendations = JSON.parse(recommendationsJson);

    return NextResponse.json({
      products: recommendations.products,
      designVision: recommendations.designVision || "",
    });
  } catch (error) {
    console.error("Product recommendation failed:", error);
    await notifyAdminError({ route: "recommend-products", error });
    return NextResponse.json(
      { error: "Failed to recommend products" },
      { status: 500 }
    );
  }
}
