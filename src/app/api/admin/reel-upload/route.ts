import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";

export const runtime = "nodejs";

const blobToken =
  process.env.BLOB_READ_WRITE_TOKEN || process.env.newblob_READ_WRITE_TOKEN;

/**
 * Issues a short-lived client-upload token so the admin's browser can put the
 * rendered reveal MP4 straight into Blob. It can't go through a route body: a
 * 7 s 1080×1920 export is ~5 MB, past the function request limit.
 *
 * Instagram then fetches the video from the resulting public URL.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody;

  // Only the token request comes from the browser. No onUploadCompleted is
  // registered, so there is no Vercel callback to let through unauthenticated.
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const json = await handleUpload({
      body,
      request,
      token: blobToken,
      onBeforeGenerateToken: async (pathname) => {
        if (!/^reels\/[\w-]+\.mp4$/.test(pathname)) {
          throw new Error("Invalid upload path");
        }
        return {
          allowedContentTypes: ["video/mp4"],
          maximumSizeInBytes: 50 * 1024 * 1024,
          addRandomSuffix: true,
        };
      },
    });
    return NextResponse.json(json);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 400 }
    );
  }
}
