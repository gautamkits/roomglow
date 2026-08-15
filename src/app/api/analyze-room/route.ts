import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { analyzeRoomParsed } from "@/lib/gemini";
import { uploadRateLimit, clientIp } from "@/lib/rateLimit";
import { isAdminEmail } from "@/lib/admin";
import { notifyAdminError } from "@/lib/email";
import { getFeatures } from "@/lib/db";
import { timed } from "@/lib/timing";

export async function POST(request: Request) {
  try {
    const { image, eventContext } = await request.json();
    if (!image) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    // Front-door of the design funnel — cap uploads per IP and per user so
    // bots (anonymous OR signed-in) can't flood the analyze/generation pipeline.
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Please sign in to design." }, { status: 401 });
    }
    const isAdmin = !!session.user.email && isAdminEmail(session.user.email);
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
    // Retries on unparseable JSON — the model occasionally degenerates into an
    // unterminated repeating string, which used to 500 the first step of the
    // funnel. See analyzeRoomParsed.
    const analysis = await timed("analyze-room", () =>
      analyzeRoomParsed(base64, eventContext)
    );

    // Whether to clear the room before designing, decided server-side so a
    // client cannot force a billed extra image call (or suppress one).
    //
    // Merged onto the RESPONSE, deliberately not added to roomAnalysisSchema:
    // a field in that schema is shared by both prompt branches and the model
    // invents values for it in the branch that never mentioned it.
    //
    // Events are gated on `stagingPlan`, which analyzeRoom only produces for
    // INDOOR venues (enforceVenueBranch strips it for outdoor). Emptying a
    // school ground or a civic forecourt is meaningless, and it would erase the
    // flagpole an Independence Day design is built around.
    const features = await getFeatures().catch(() => ({}) as Record<string, boolean>);
    const alwaysEmpty = eventContext
      ? !!features.always_empty_event && !!analysis.stagingPlan
      : !!features.always_empty_space;

    return NextResponse.json({ ...analysis, alwaysEmpty });
  } catch (error) {
    console.error("Room analysis failed:", error);
    await notifyAdminError({ route: "analyze-room", error });
    return NextResponse.json(
      { error: "Failed to analyze room" },
      { status: 500 }
    );
  }
}
