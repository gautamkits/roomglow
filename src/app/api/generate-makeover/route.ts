import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { generateMakeoverImage } from "@/lib/gemini";
import { getFeatures, recordImageGen } from "@/lib/db";
import { rateLimit } from "@/lib/rateLimit";
import { isAdminEmail } from "@/lib/admin";
import { notifyAdminError } from "@/lib/email";

export const maxDuration = 60;

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

    const isAdmin = isAdminEmail(session.user.email ?? "");
    const limit = isAdmin ? 100 : 30;
    const { ok } = rateLimit(`gen-makeover:${session.user.id}`, limit, 60 * 60 * 1000);
    if (!ok) {
      return NextResponse.json({ error: "Rate limit reached. Try again later." }, { status: 429 });
    }

    const { originalImage, products, styleHint, detect } = await request.json();
    if (!originalImage || !products) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const base64 = originalImage.replace(/^data:image\/\w+;base64,/, "");

    await recordImageGen("design", session.user.id);

    const result = await generateMakeoverImage(base64, products, styleHint || "", detect ?? false);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Makeover generation failed:", error);
    await notifyAdminError({ route: "generate-makeover", error });
    return NextResponse.json({ error: "Failed to generate makeover" }, { status: 500 });
  }
}
