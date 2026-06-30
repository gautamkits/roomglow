import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { recommendOutfit } from "@/lib/gemini";
import { getFeatures } from "@/lib/db";
import { notifyAdminError } from "@/lib/email";

export async function POST(request: Request) {
  try {
    const features = await getFeatures();
    if (!features.makeover) {
      return NextResponse.json({ error: "Feature not available" }, { status: 403 });
    }

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    }

    const { personAnalysis, styleType, styleContext, selectedItems, gender } = await request.json();
    if (!personAnalysis || !styleType) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const resultJson = await recommendOutfit(
      personAnalysis,
      styleType,
      styleContext || styleType,
      selectedItems || [],
      gender
    );
    const result = JSON.parse(resultJson);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Outfit recommendation failed:", error);
    await notifyAdminError({ route: "recommend-outfit", error });
    return NextResponse.json({ error: "Failed to recommend outfit" }, { status: 500 });
  }
}
