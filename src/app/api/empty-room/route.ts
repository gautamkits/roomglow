import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { emptyRoom } from "@/lib/gemini";
import { rateLimit } from "@/lib/rateLimit";
import { recordImageGen } from "@/lib/db";
import { isAdminEmail } from "@/lib/admin";
import { notifyAdminError } from "@/lib/email";

export async function POST(request: Request) {
  try {
    const { image, removeLabels, keepLabels, orphanedLabels } = await request.json();
    if (!image) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    // Emptying the room is a paid image-generation step — sign-in required,
    // then a per-user hourly cap so a "try clearing again" loop / refresh can't
    // rack up paid gens. Admins get a higher cap, not a free pass.
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Please sign in to continue." }, { status: 401 });
    }
    {
      const limit = isAdminEmail(session.user.email) ? 100 : 30;
      const { ok, retryAfterMs } = rateLimit(
        `emptyroom:user:${session.user.id}`,
        limit,
        60 * 60 * 1000
      );
      if (!ok) {
        return NextResponse.json(
          { error: "You're clearing rooms very quickly. Please wait a bit and try again." },
          { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } }
        );
      }
    }

    const base64 = image.replace(/^data:image\/\w+;base64,/, "");
    const emptied = await emptyRoom(
      base64,
      Array.isArray(removeLabels) ? removeLabels : [],
      Array.isArray(keepLabels) ? keepLabels : [],
      Array.isArray(orphanedLabels) ? orphanedLabels : []
    );

    // Track the billed image-gen call for cost analytics (empty-room pass).
    await recordImageGen("empty", session?.user?.id);

    return NextResponse.json({ emptiedImage: emptied });
  } catch (error) {
    console.error("Room emptying failed:", error);
    await notifyAdminError({ route: "empty-room", error });
    return NextResponse.json(
      { error: "Failed to clear your space" },
      { status: 500 }
    );
  }
}
