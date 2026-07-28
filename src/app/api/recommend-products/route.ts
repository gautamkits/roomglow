import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { recommendProducts } from "@/lib/gemini";
import { notifyAdminError } from "@/lib/email";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Please sign in to continue." }, { status: 401 });
    }

    const { roomAnalysis, userAnswers, selectedProductTypes, eventContext, removeLabels } =
      await request.json();
    if (!roomAnalysis || !userAnswers) {
      return NextResponse.json({ error: "Missing data" }, { status: 400 });
    }

    const recommendationsJson = await recommendProducts(
      roomAnalysis,
      userAnswers,
      selectedProductTypes || [],
      eventContext,
      Array.isArray(removeLabels) ? removeLabels : []
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
