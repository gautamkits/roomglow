import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { refreshSuggestions } from "@/lib/gemini";
import { notifyAdminError } from "@/lib/email";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Please sign in to continue." }, { status: 401 });
    }

    const { image, roomAnalysis, removeLabels } = await request.json();
    if (!image || !roomAnalysis || !Array.isArray(removeLabels) || removeLabels.length === 0) {
      return NextResponse.json({ error: "Missing data" }, { status: 400 });
    }

    const base64 = image.replace(/^data:image\/\w+;base64,/, "");
    const json = await refreshSuggestions(base64, roomAnalysis, removeLabels);
    const parsed = JSON.parse(json);

    return NextResponse.json({ suggestedProducts: parsed.suggestedProducts ?? [] });
  } catch (error) {
    console.error("Suggestion refresh failed:", error);
    await notifyAdminError({ route: "refresh-suggestions", error });
    return NextResponse.json({ error: "Failed to refresh suggestions" }, { status: 500 });
  }
}
