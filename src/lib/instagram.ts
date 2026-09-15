/**
 * Instagram Graph API — Reels publishing for the noosho business account.
 *
 * Publishing is three calls: create a media container from a PUBLIC video URL,
 * wait for Instagram to finish ingesting it, then publish the container. The
 * token is sent in the request body, never the URL, so it can't land in logs.
 *
 * Needs IG_USER_ID (the Instagram business account id, not the Page id) and
 * IG_ACCESS_TOKEN (a System User token with instagram_content_publish).
 */

const GRAPH = "https://graph.facebook.com/v21.0";

/** How long to wait for Instagram to process the video before giving up. The
 *  route runs with maxDuration 300, so this leaves headroom for the publish. */
const PROCESS_TIMEOUT_MS = 240_000;
const POLL_INTERVAL_MS = 5_000;

export function instagramConfigured(): boolean {
  return !!(process.env.IG_USER_ID && process.env.IG_ACCESS_TOKEN);
}

/** Graph API error surfaced with Meta's own wording — "Media ID is not
 *  available" or a permissions message is far more useful than a status code. */
export class InstagramError extends Error {}

async function graph<T>(
  path: string,
  params: Record<string, string>,
  method: "GET" | "POST" = "POST"
): Promise<T> {
  const body = new URLSearchParams({
    ...params,
    access_token: process.env.IG_ACCESS_TOKEN!,
  });
  const res =
    method === "POST"
      ? await fetch(`${GRAPH}/${path}`, { method: "POST", body })
      : await fetch(`${GRAPH}/${path}?${body}`);
  const json = (await res.json().catch(() => ({}))) as T & {
    error?: { message?: string; error_user_msg?: string; code?: number };
  };
  if (!res.ok || json.error) {
    const e = json.error;
    throw new InstagramError(
      `Instagram: ${e?.error_user_msg || e?.message || `HTTP ${res.status}`}${
        e?.code ? ` (code ${e.code})` : ""
      }`
    );
  }
  return json;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Read-only check that the token and account id are wired up correctly. */
export async function instagramAccount(): Promise<{ id: string; username: string }> {
  return graph(process.env.IG_USER_ID!, { fields: "id,username" }, "GET");
}

/**
 * Publish a Reel from a publicly reachable MP4. Resolves once it is live, with
 * the media id and permalink. Throws InstagramError with Meta's message on any
 * failure, including processing errors and the ingest timeout.
 */
export async function publishReel(opts: {
  videoUrl: string;
  caption: string;
}): Promise<{ mediaId: string; permalink: string | null }> {
  const igUser = process.env.IG_USER_ID!;

  // 1. Container. share_to_feed keeps the Reel on the profile grid too.
  const { id: containerId } = await graph<{ id: string }>(`${igUser}/media`, {
    media_type: "REELS",
    video_url: opts.videoUrl,
    caption: opts.caption,
    share_to_feed: "true",
  });

  // 2. Wait for ingest. Publishing an IN_PROGRESS container fails outright.
  const deadline = Date.now() + PROCESS_TIMEOUT_MS;
  for (;;) {
    const { status_code, status } = await graph<{
      status_code?: string;
      status?: string;
    }>(containerId, { fields: "status_code,status" }, "GET");
    if (status_code === "FINISHED") break;
    if (status_code === "ERROR" || status_code === "EXPIRED") {
      throw new InstagramError(
        `Instagram couldn't process the video (${status_code}${status ? `: ${status}` : ""}).`
      );
    }
    if (Date.now() > deadline) {
      throw new InstagramError(
        "Instagram is still processing the video after 4 minutes. It was not published — try again shortly."
      );
    }
    await sleep(POLL_INTERVAL_MS);
  }

  // 3. Publish, then fetch the public link.
  const { id: mediaId } = await graph<{ id: string }>(`${igUser}/media_publish`, {
    creation_id: containerId,
  });
  let permalink: string | null = null;
  try {
    ({ permalink } = await graph<{ permalink: string }>(
      mediaId,
      { fields: "permalink" },
      "GET"
    ));
  } catch {
    // Published fine; the link is a nicety. Don't fail a live post over it.
  }
  return { mediaId, permalink };
}
