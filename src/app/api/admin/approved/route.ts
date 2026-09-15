import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { getGalleryCards, getInstagramPosts } from "@/lib/db";

export async function GET() {
  try {
    const session = await auth();
    if (!isAdminEmail(session?.user?.email)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const cards = await getGalleryCards({ sort: "newest", limit: 200 });
    // Merged here rather than selected in getGalleryCards, which also serves the
    // public homepage. Best-effort: the list still loads if this lookup fails.
    const posts = await getInstagramPosts(cards.map((d) => d.id)).catch((e) => {
      console.error("Instagram post lookup failed:", e);
      return {} as Awaited<ReturnType<typeof getInstagramPosts>>;
    });
    const designs = cards.map((d) => ({ ...d, ...(posts[d.id] ?? {}) }));
    return NextResponse.json({ designs });
  } catch (error) {
    console.error("Admin approved list failed:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
