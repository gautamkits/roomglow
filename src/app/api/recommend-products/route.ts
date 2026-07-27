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

    const {
      roomAnalysis,
      userAnswers,
      selectedProductTypes,
      eventContext,
      removeLabels,
      originalImage,
    } = await request.json();
    if (!roomAnalysis || !userAnswers) {
      return NextResponse.json({ error: "Missing data" }, { status: 400 });
    }

    // Events pass the venue photo so placements reference zones that are
    // actually visible; absent/blank is fine and falls back to text-only.
    const roomImageBase64 =
      typeof originalImage === "string" && originalImage
        ? originalImage.replace(/^data:image\/\w+;base64,/, "")
        : undefined;

    const recommendationsJson = await recommendProducts(
      roomAnalysis,
      userAnswers,
      selectedProductTypes || [],
      eventContext,
      Array.isArray(removeLabels) ? removeLabels : [],
      roomImageBase64
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
