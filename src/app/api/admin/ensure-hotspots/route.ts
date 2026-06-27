import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { ensureHotspots } from "@/lib/hotspots";
import { getDesign } from "@/lib/db";

export const runtime = "nodejs";

// Admin: generate + persist product hotspots for a design on demand (used by the
// reveal export so the in-scene arrow callout has product positions to point at).
export async function POST(request: Request) {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const { designId } = await request.json();
    if (!designId) {
      return NextResponse.json({ error: "Missing designId" }, { status: 400 });
    }
    await ensureHotspots(designId);
    const d = await getDesign(designId);
    return NextResponse.json({ hotspots: d?.hotspots ?? [] });
  } catch (err) {
    console.error("[admin/ensure-hotspots]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
