import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { analyzeRoom } from "@/lib/gemini";
import { uploadRateLimit, clientIp } from "@/lib/rateLimit";
import { isAdminEmail } from "@/lib/admin";
import { notifyAdminError } from "@/lib/email";

export async function POST(request: Request) {
  try {
    const { image, eventContext } = await request.json();
    if (!image) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    // Front-door of the design funnel — cap uploads per IP and per user so
    // bots (anonymous OR signed-in) can't flood the analyze/generation pipeline.
    const session = await auth();
    const isAdmin = !!session?.user?.email && isAdminEmail(session.user.email);
    const { ok, retryAfterMs } = uploadRateLimit({
      key: "analyze",
      ip: clientIp(request),
      userId: session?.user?.id,
      isAdmin,
    });
    if (!ok) {
      return NextResponse.json(
        {
          error: session?.user?.id
            ? "You're uploading very quickly. Please wait a bit and try again."
            : "You've reached the free limit. Sign in to keep designing.",
        },
        { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } }
      );
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
