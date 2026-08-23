import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { recommendProducts, parseJsonWithRetry } from "@/lib/gemini";
import { localeFromRequest } from "@/lib/locale";
import { notifyAdminError } from "@/lib/email";
import { timed } from "@/lib/timing";
import { withLessons } from "@/lib/lessons";

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
      eventType,
      removeLabels,
      autoCleared,
    } = await request.json();
    if (!roomAnalysis || !userAnswers) {
      return NextResponse.json({ error: "Missing data" }, { status: 400 });
    }

    // Same locale the downstream /api/search-products call uses, so the query
    // wording matches the marketplace it will actually be searched against.
    // Retry unparseable output instead of 500ing on it. The model occasionally
    // degenerates into a repeating run — one measured response was 66KB of
    // digits inside `fitScore` — and a bare JSON.parse turned that into "We
    // couldn't create a design plan" with no second chance. Same guard
    // analyzeRoom has had since a081b74.
    // Learned corrections ride along with the event brief. No-op for space.
    const brief = await withLessons(eventContext, eventType);
    const recommendations = await timed("recommend-products", () =>
      parseJsonWithRetry<{ products?: unknown; designVision?: string }>(
        () =>
          recommendProducts(
            roomAnalysis,
            userAnswers,
            selectedProductTypes || [],
            brief,
            Array.isArray(removeLabels) ? removeLabels : [],
            localeFromRequest(request),
            !!autoCleared
          ),
        3,
        "recommendProducts"
      )
    );

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
