import { NextResponse } from "next/server";
import { recommendProducts } from "@/lib/gemini";
import { notifyAdminError } from "@/lib/email";

export async function POST(request: Request) {
  try {
    const { roomAnalysis, userAnswers, selectedProductTypes, eventContext } =
      await request.json();
    if (!roomAnalysis || !userAnswers) {
      return NextResponse.json({ error: "Missing data" }, { status: 400 });
    }

    const recommendationsJson = await recommendProducts(
      roomAnalysis,
      userAnswers,
      selectedProductTypes || [],
      eventContext
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
