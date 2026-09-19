import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { listReels, pickRandomReel } from "@/lib/reels";

export const runtime = "nodejs";

// GET            → every published design with its reel video + caption
// GET ?pick=random → one design not posted in the last 30 days
export async function GET(request: Request) {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const reels = await listReels();
    if (new URL(request.url).searchParams.get("pick") === "random") {
      const pick = pickRandomReel(reels);
      if (!pick) return NextResponse.json({ error: "No published designs" }, { status: 404 });
      return NextResponse.json({ reel: pick });
    }
    return NextResponse.json({ reels });
  } catch (error) {
    console.error("Admin reels list failed:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
