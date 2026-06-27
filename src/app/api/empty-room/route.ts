import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { emptyRoom } from "@/lib/gemini";
import { rateLimit, clientIp } from "@/lib/rateLimit";

export async function POST(request: Request) {
  try {
    const { image, removeLabels, keepLabels } = await request.json();
    if (!image) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    // Emptying the room is a paid image-generation step — cap it per-IP for
    // anonymous visitors, mirroring /api/generate-image.
    const session = await auth();
    if (!session?.user?.id) {
      const { ok, retryAfterMs } = rateLimit(
        `emptyroom:${clientIp(request)}`,
        6,
        60 * 60 * 1000
      );
      if (!ok) {
        return NextResponse.json(
          { error: "You've reached the free limit. Sign in to keep designing." },
          { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } }
        );
      }
    }

    const base64 = image.replace(/^data:image\/\w+;base64,/, "");
    const emptied = await emptyRoom(
      base64,
      Array.isArray(removeLabels) ? removeLabels : [],
      Array.isArray(keepLabels) ? keepLabels : []
    );

    return NextResponse.json({ emptiedImage: emptied });
  } catch (error) {
    console.error("Room emptying failed:", error);
    return NextResponse.json(
      { error: "Failed to clear your space" },
      { status: 500 }
    );
  }
}
