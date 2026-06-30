import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { analyzePerson } from "@/lib/gemini";
import { getFeatures } from "@/lib/db";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { notifyAdminError } from "@/lib/email";

export async function POST(request: Request) {
  try {
    const features = await getFeatures();
    if (!features.makeover) {
      return NextResponse.json({ error: "Feature not available" }, { status: 403 });
    }

    const { image, styleContext } = await request.json();
    if (!image) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    const session = await auth();
    if (!session?.user?.id) {
      const { ok, retryAfterMs } = rateLimit(`analyze-person:${clientIp(request)}`, 12, 60 * 60 * 1000);
      if (!ok) {
        return NextResponse.json(
          { error: "You've reached the free limit. Sign in to keep going." },
          { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } }
        );
      }
    }

    const base64 = image.replace(/^data:image\/\w+;base64,/, "");
    const analysisJson = await analyzePerson(base64, styleContext || "casual");
    const analysis = JSON.parse(analysisJson);

    return NextResponse.json(analysis);
  } catch (error) {
    console.error("Person analysis failed:", error);
    await notifyAdminError({ route: "analyze-person", error });
    return NextResponse.json({ error: "Failed to analyze photo" }, { status: 500 });
  }
}
