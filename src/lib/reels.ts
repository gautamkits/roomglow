import { getGalleryCards, getLastReelPosts } from "@/lib/db";
import { designTitle } from "@/lib/admin";
import { reelCaption } from "@/lib/serverReel";

/** Designs posted within this window are skipped by the random pick. */
export const REPOST_COOLDOWN_DAYS = 30;

export interface ReelItem {
  id: string;
  title: string;
  caption: string;
  thumbnailUrl: string;
  videoUrl: string;
  lastPostedAt: string | null;
}

/** Every published (gallery-approved) design, newest first. */
export async function listReels(): Promise<ReelItem[]> {
  const [designs, posts] = await Promise.all([
    getGalleryCards({ sort: "newest", limit: 1000 }),
    getLastReelPosts(),
  ]);
  return designs.map((d) => ({
    id: d.id,
    title: designTitle(d),
    caption: reelCaption(d),
    thumbnailUrl: `/api/image/${d.id}/after`,
    videoUrl: `/api/admin/reels/${d.id}/video`,
    lastPostedAt: posts[d.id] ?? null,
  }));
}

/** Random design not posted in the cooldown window; if every design has been
 *  posted recently, the one posted longest ago. */
export function pickRandomReel(items: ReelItem[]): ReelItem | null {
  const cutoff = Date.now() - REPOST_COOLDOWN_DAYS * 86_400_000;
  const fresh = items.filter(
    (r) => !r.lastPostedAt || new Date(r.lastPostedAt).getTime() < cutoff
  );
  if (fresh.length) return fresh[Math.floor(Math.random() * fresh.length)];
  return [...items].sort((a, b) =>
    (a.lastPostedAt || "").localeCompare(b.lastPostedAt || "")
  )[0] ?? null;
}
