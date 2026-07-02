import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { auth } from "@/auth";
import {
  getDesign,
  saveDesign,
  countRestyles,
  setRestyledFrom,
  recordImageGen,
} from "@/lib/db";
import { generateDesignImage } from "@/lib/gemini";
import { makeBlurDataUrl } from "@/lib/images";
import { isAdminEmail } from "@/lib/admin";
import type { ProductResult } from "@/lib/types";

export const runtime = "nodejs";

const MAX_RESTYLES = 5;

const blobToken =
  process.env.BLOB_READ_WRITE_TOKEN || process.env.newblob_READ_WRITE_TOKEN;

async function imageToBase64(url: string): Promise<string | null> {
  if (url.startsWith("data:")) {
    const m = url.match(/^data:image\/\w+;base64,(.+)$/);
    return m ? m[1] : null;
  }
  const res = await fetch(url);
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.toString("base64");
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { designId, styleHint } = await request.json();
    if (!designId || !styleHint) {
      return NextResponse.json({ error: "Missing data" }, { status: 400 });
    }

    const design = await getDesign(designId);
    if (!design) {
      return NextResponse.json({ error: "Design not found" }, { status: 404 });
    }

    const isOwner = design.user_id === session.user.id;
    if (!isOwner && !isAdminEmail(session.user.email)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!design.is_unlocked) {
      return NextResponse.json({ error: "Unlock the design first" }, { status: 403 });
    }
    if (design.mode !== "space") {
      return NextResponse.json({ error: "Restyle is only for room designs" }, { status: 400 });
    }

    // Enforce the soft restyle cap across the whole lineage.
    const rootId = design.restyled_from || design.id;
    const used = await countRestyles(rootId);
    if (used >= MAX_RESTYLES) {
      return NextResponse.json(
        { error: `You've used all ${MAX_RESTYLES} restyles for this design.` },
        { status: 429 }
      );
    }

    const base64 = await imageToBase64(design.original_image_url);
    if (!base64) {
      return NextResponse.json({ error: "Could not load the room photo" }, { status: 502 });
    }

    const products = (design.products as ProductResult[]) ?? [];
    const { generatedImage, hotspots } = await generateDesignImage(
      base64,
      products.map((p) => ({
        category: p.recommendation.category,
        placement: p.recommendation.placement,
        title: p.amazonProduct?.title || p.recommendation.category,
        colorSuggestion: p.recommendation.colorSuggestion,
        imageUrl: p.amazonProduct?.imageUrl || "",
      })),
      undefined,
      styleHint
    );

    // Track the billed image-gen call for cost analytics (same as generate-image).
    await recordImageGen("restyle", session.user.id);

    // Upload the new render; reuse the original room photo URL as-is.
    const genBuf = Buffer.from(generatedImage, "base64");
    const genBlob = await put(`designs/${Date.now()}-restyle.png`, genBuf, {
      access: "public",
      contentType: "image/png",
      addRandomSuffix: true,
      token: blobToken,
    });
    const generatedBlur = await makeBlurDataUrl(genBuf).catch(() => null);

    const newId = await saveDesign({
      mode: "space",
      eventConfig: null,
      roomAnalysis: design.room_analysis ?? null,
      products: design.products,
      hotspots,
      designNarrative: design.design_narrative || "",
      originalImageUrl: design.original_image_url,
      generatedImageUrl: genBlob.url,
      originalBlur: design.original_blur ?? null,
      generatedBlur,
      userId: session.user.id,
      isUnlocked: true,
      selectedItems: design.selected_items ?? null,
    });

    await setRestyledFrom(newId, rootId);

    return NextResponse.json({ designId: newId, restylesLeft: MAX_RESTYLES - used - 1 });
  } catch (err) {
    console.error("[restyle-design]", err);
    return NextResponse.json({ error: "Restyle failed. Please try again." }, { status: 500 });
  }
}
