import { NextResponse } from "next/server";
import { getDesign } from "@/lib/db";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { designVisibility } from "@/lib/access";

// Paid, private fields. The master image URLs point at public Blob objects, so
// handing them out is equivalent to handing out the unwatermarked design —
// this route previously returned the whole row to anyone holding a UUID, which
// bypassed both the sharing model and the paywall.
const ENTITLED_ONLY = [
  "generated_image_url",
  "original_image_url",
  "cleared_image_url",
  "preview_image_url",
  "products",
  "hotspots",
  "room_analysis",
] as const;

// Never leaves the server regardless of entitlement — internal bookkeeping and
// the owner's identity.
const NEVER_EXPOSE = [
  "user_id",
  "gifted_by",
  "gifted_at",
  "ig_media_id",
  "ig_permalink",
  "ig_posted_at",
] as const;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ designId: string }> }
) {
  try {
    const { designId } = await params;
    const design = await getDesign(designId);

    if (!design) {
      return NextResponse.json({ error: "Design not found" }, { status: 404 });
    }

    const session = await auth();

    // Privacy: same predicate as the design page, /api/image, /api/og and
    // /api/share — owner, shared emails, admins, or everyone once approved.
    const { canView } = await designVisibility(design, session);
    if (!canView) {
      return NextResponse.json({ error: "Private" }, { status: 403 });
    }

    // Entitlement: matches /api/image/[designId]/[variant]. A viewer who may
    // see that a design exists is not necessarily entitled to the paid pixels
    // or the product/hotspot data behind the paywall.
    const entitled =
      design.is_unlocked ||
      design.gallery_status === "approved" ||
      isAdminEmail(session?.user?.email);

    const body: Record<string, unknown> = { ...design };
    for (const key of NEVER_EXPOSE) delete body[key];
    if (!entitled) {
      for (const key of ENTITLED_ONLY) delete body[key];
    }
    body.entitled = entitled;

    return NextResponse.json(body);
  } catch (error) {
    console.error("Get design failed:", error);
    return NextResponse.json({ error: "Failed to fetch design" }, { status: 500 });
  }
}
