import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";

export const runtime = "nodejs";

// Admin: lets the browser upload a silent "Noosho explains" render straight to
// Blob (too big for a function body) so /api/admin/noosho-explain can mux the
// voice in as AAC. Needed on phones: mobile browsers can't encode AAC, and an
// Opus track in MP4 plays silent in phone galleries and Instagram.
const blobToken = process.env.newblob_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;

export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody;
  try {
    const json = await handleUpload({
      body,
      request,
      token: blobToken,
      onBeforeGenerateToken: async (pathname) => {
        const session = await auth();
        if (!isAdminEmail(session?.user?.email)) throw new Error("Forbidden");
        if (!pathname.startsWith("promo-tmp/")) throw new Error("Bad path");
        return {
          allowedContentTypes: ["video/mp4"],
          maximumSizeInBytes: 200 * 1024 * 1024,
          addRandomSuffix: true,
        };
      },
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(json);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Upload failed" }, { status: 400 });
  }
}
