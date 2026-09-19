import { getGalleryCards } from "@/lib/db";
import { designTitle } from "@/lib/admin";
import { reelCaption } from "@/lib/serverReel";

export interface ReelItem {
  id: string;
  title: string;
  caption: string;
  thumbnailUrl: string;
  videoUrl: string;
}

/** Every published (gallery-approved) design, newest first. */
export async function listReels(): Promise<ReelItem[]> {
  const designs = await getGalleryCards({ sort: "newest", limit: 1000 });
  return designs.map((d) => ({
    id: d.id,
    title: designTitle(d),
    caption: reelCaption(d),
    thumbnailUrl: `/api/image/${d.id}/after`,
    videoUrl: `/api/admin/reels/${d.id}/video`,
  }));
}
