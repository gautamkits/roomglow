import { auth } from "@/auth";
import type { Session } from "next-auth";
import { isAdminEmail } from "@/lib/admin";
import { isDesignSharedWith } from "@/lib/db";

export interface DesignVisibility {
  canView: boolean;
  isOwner: boolean;
}

/**
 * Privacy model: a design is viewable by
 *  - everyone, once it's gallery-approved (public),
 *  - its owner,
 *  - admins,
 *  - anyone signed in with an email the owner shared it to (design_shares).
 * Legacy designs with no owner (user_id NULL) predate the privacy model and
 * stay link-viewable — there's no owner who could manage access to them.
 *
 * Every surface that exposes design pixels or details must go through this:
 * the design page, /api/image, /api/og, /api/share (GIF).
 */
export async function designVisibility(
  // getDesign returns an untyped row; only these three columns matter here.
  design: Record<string, unknown>,
  session?: Session | null
): Promise<DesignVisibility> {
  const id = String(design.id ?? "");
  const ownerId = (design.user_id as string | null) ?? null;
  const galleryStatus = (design.gallery_status as string | null) ?? null;

  const s = session === undefined ? await auth() : session;
  const email = s?.user?.email ?? null;
  const isOwner = !!ownerId && s?.user?.id === ownerId;

  if (galleryStatus === "approved") return { canView: true, isOwner };
  if (!ownerId) return { canView: true, isOwner: false };
  if (isOwner || isAdminEmail(email)) return { canView: true, isOwner };
  if (id && email && (await isDesignSharedWith(id, email))) {
    return { canView: true, isOwner: false };
  }
  return { canView: false, isOwner: false };
}
