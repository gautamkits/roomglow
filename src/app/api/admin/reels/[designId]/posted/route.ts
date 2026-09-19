import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { getDesign, recordReelPost } from "@/lib/db";

export const runtime = "nodejs";

// POST → record that this design was posted as a Reel (resets its 30-day cooldown).
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ designId: string }> }
) {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { designId } = await params;
  const design = await getDesign(designId).catch(() => null);
  if (!design) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await recordReelPost(designId, session?.user?.email ?? null);
  return NextResponse.json({ ok: true, postedAt: new Date().toISOString() });
}
