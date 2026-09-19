import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { getDesign } from "@/lib/db";
import { getOrRenderReel } from "@/lib/serverReel";

export const runtime = "nodejs";
// First request for a design renders the MP4 (~20–40s); later ones hit the Blob cache.
export const maxDuration = 300;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ designId: string }> }
) {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { designId } = await params;
  const design = await getDesign(designId).catch(() => null);
  if (!design || design.gallery_status !== "approved") {
    return NextResponse.json({ error: "Published design not found" }, { status: 404 });
  }
  try {
    const refresh = new URL(request.url).searchParams.get("refresh") === "1";
    const url = await getOrRenderReel(design as { id: string }, refresh);
    const upstream = await fetch(url, { cache: "no-store" });
    if (!upstream.ok || !upstream.body) throw new Error(`Blob fetch ${upstream.status}`);
    return new Response(upstream.body, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": `attachment; filename="noosho-${designId}.mp4"`,
        "Cache-Control": "private, no-store",
        "X-Reel-Url": url,
      },
    });
  } catch (error) {
    console.error("Reel render failed:", error);
    return NextResponse.json({ error: "Render failed" }, { status: 500 });
  }
}
