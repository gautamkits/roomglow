import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { analyzeRoom } from "@/lib/gemini";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { notifyAdminError } from "@/lib/email";

export async function POST(request: Request) {
  try {
    const { image, eventContext } = await request.json();
    if (!image) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    // Entry step is open to anonymous visitors (U1); cap it per-IP to limit
    // bot/abuse floods. Signed-in users are unaffected.
    const session = await auth();
    if (!session?.user?.id) {
      const { ok, retryAfterMs } = rateLimit(`analyze:${clientIp(request)}`, 12, 60 * 60 * 1000);
      if (!ok) {
        return NextResponse.json(
          { error: "You've reached the free limit. Sign in to keep designing." },
          { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } }
        );
      }
    }

    const base64 = image.replace(/^data:image\/\w+;base64,/, "");
    const analysisJson = await analyzeRoom(base64, eventContext);
    const analysis = JSON.parse(analysisJson);

    return NextResponse.json(analysis);
  } catch (error) {
    console.error("Room analysis failed:", error);
    await notifyAdminError({ route: "analyze-room", error });
    return NextResponse.json(
      { error: "Failed to analyze room" },
      { status: 500 }
    );
  }
}
