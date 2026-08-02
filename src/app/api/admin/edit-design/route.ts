import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { getDesign, updateDesignImage, recordImageGen } from "@/lib/db";
import { editDesignImage } from "@/lib/gemini";
import { makeBlurDataUrl, makeWatermarkedPreview } from "@/lib/images";
import { notifyAdminError } from "@/lib/email";
import { rateLimit } from "@/lib/rateLimit";

// Blob + sharp + an image model call — not edge.
export const runtime = "nodejs";
// One image round trip, but gemini-3.1-flash-image is not fast.
export const maxDuration = 300;

const blobToken =
  process.env.BLOB_READ_WRITE_TOKEN || process.env.newblob_READ_WRITE_TOKEN;

const MAX_INSTRUCTION = 600;

/**
 * Admin touch-up of a finished design.
 *
 * Distinct from admin/regenerate-design in three ways the reviewer cares about:
 * it edits the EXISTING render rather than re-deriving one from the original
 * photo, it never touches Amazon (no recommend/search/curate, so no product or
 * price churn and no RapidAPI spend), and it updates the design in place so the
 * review queue doesn't gain a duplicate.
 *
 * Hotspots are deliberately left alone. They're stored as percentages against a
 * product list this route does not modify, and `editDesignImage` pins the output
 * aspect ratio, so the existing pins stay correct. `ensureHotspots` also
 * short-circuits on a non-empty array, so nothing will quietly re-detect them
 * later either.
 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!isAdminEmail(session?.user?.email)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Same shape as admin-regen: image generation is the expensive call here.
    if (!rateLimit(`admin-edit:${session!.user!.id}`, 30, 60 * 60 * 1000).ok) {
      return NextResponse.json(
        { error: "Too many edits this hour. Try again later." },
        { status: 429 }
      );
    }

    const body = (await request.json()) as {
      designId?: string;
      instruction?: string;
    };
    const designId = body.designId?.trim();
    const instruction = body.instruction?.trim();

    if (!designId) {
      return NextResponse.json({ error: "designId required" }, { status: 400 });
    }
    if (!instruction) {
      return NextResponse.json(
        { error: "Describe the edit you want." },
        { status: 400 }
      );
    }
    if (instruction.length > MAX_INSTRUCTION) {
      return NextResponse.json(
        { error: `Keep the edit under ${MAX_INSTRUCTION} characters.` },
        { status: 400 }
      );
    }

    const design = await getDesign(designId);
    if (!design) {
      return NextResponse.json({ error: "Design not found" }, { status: 404 });
    }
    const currentUrl = String(design.generated_image_url || "");
    if (!currentUrl) {
      return NextResponse.json(
        { error: "This design has no rendered image to edit." },
        { status: 400 }
      );
    }

    // Edit the CURRENT render, so repeated edits compound rather than resetting.
    const res = await fetch(currentUrl);
    if (!res.ok) {
      return NextResponse.json(
        { error: "Could not load the current design image." },
        { status: 502 }
      );
    }
    const base64 = Buffer.from(await res.arrayBuffer()).toString("base64");

    const edited = await editDesignImage(base64, instruction);
    const editedBuf = Buffer.from(edited, "base64");

    const ts = Date.now();
    const blob = await put(`designs/${ts}-admin-edit.png`, editedBuf, {
      access: "public",
      contentType: "image/png",
      addRandomSuffix: true,
      token: blobToken,
    });

    const generatedBlur = await makeBlurDataUrl(editedBuf).catch(() => null);

    // Locked designs serve a watermarked preview; it has to track the new image
    // or the paywalled view keeps showing the pre-edit render.
    let previewImageUrl: string | null = null;
    if (!design.is_unlocked) {
      try {
        const previewBuf = await makeWatermarkedPreview(editedBuf);
        const previewBlob = await put(
          `designs/${ts}-admin-edit-preview.jpg`,
          previewBuf,
          {
            access: "public",
            contentType: "image/jpeg",
            addRandomSuffix: true,
            token: blobToken,
          }
        );
        previewImageUrl = previewBlob.url;
      } catch (e) {
        console.error("[admin-edit] preview generation failed:", e);
      }
    }

    await updateDesignImage(designId, {
      generatedImageUrl: blob.url,
      generatedBlur,
      previewImageUrl,
    });

    await recordImageGen("edit", session!.user!.id).catch(() => {});

    return NextResponse.json({ generatedImageUrl: blob.url });
  } catch (error) {
    console.error("Admin edit failed:", error);
    await notifyAdminError({ route: "admin/edit-design", error });
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to edit the design",
      },
      { status: 500 }
    );
  }
}
