import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { getDesignInstagramPost, markDesignPostedToInstagram } from "@/lib/db";
import { instagramConfigured, publishReel, InstagramError } from "@/lib/instagram";
import { notifyAdminError } from "@/lib/email";

export const runtime = "nodejs";
// Instagram ingests the video asynchronously; publishReel polls for up to 4 min.
export const maxDuration = 300;

const MAX_CAPTION = 2200;

/** Only our own Blob store — never hand Meta an arbitrary URL from the client. */
function isOurBlobUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && u.hostname.endsWith(".public.blob.vercel-storage.com");
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!instagramConfigured()) {
    return NextResponse.json(
      { error: "Instagram isn't configured yet — IG_USER_ID and IG_ACCESS_TOKEN need to be set in Vercel." },
      { status: 503 }
    );
  }

  const { designId, videoUrl, caption, force } = (await request.json().catch(() => ({}))) as {
    designId?: string;
    videoUrl?: string;
    caption?: string;
    force?: boolean;
  };
  if (!designId || !videoUrl || !isOurBlobUrl(videoUrl)) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const text = (caption ?? "").trim();
  if (text.length > MAX_CAPTION) {
    return NextResponse.json(
      { error: `Caption is ${text.length} characters; Instagram allows ${MAX_CAPTION}.` },
      { status: 400 }
    );
  }

  // A double-click, or a second admin tab, must not post the same design twice.
  const existing = await getDesignInstagramPost(designId);
  if (!existing) {
    return NextResponse.json({ error: "Design not found" }, { status: 404 });
  }
  if (existing.ig_media_id && !force) {
    return NextResponse.json(
      { error: "Already posted to Instagram.", permalink: existing.ig_permalink },
      { status: 409 }
    );
  }

  try {
    const { mediaId, permalink } = await publishReel({ videoUrl, caption: text });
    await markDesignPostedToInstagram(designId, mediaId, permalink);
    return NextResponse.json({ mediaId, permalink });
  } catch (error) {
    console.error("Instagram post failed:", error);
    await notifyAdminError({
      route: "instagram-post",
      error,
      userEmail: session?.user?.email ?? undefined,
      extra: { designId },
    });
    const message =
      error instanceof InstagramError ? error.message : "Posting to Instagram failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
