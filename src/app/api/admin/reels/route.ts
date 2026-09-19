import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { listReels } from "@/lib/reels";

export const runtime = "nodejs";

// GET → every published design with its reel video + caption
export async function GET() {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const reels = await listReels();
    return NextResponse.json({ reels });
  } catch (error) {
    console.error("Admin reels list failed:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
