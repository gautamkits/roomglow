import { NextResponse, after } from "next/server";
import { put } from "@vercel/blob";
import { auth } from "@/auth";
import { saveDesign, saveEventDate } from "@/lib/db";
import { makeBlurDataUrl, makeWatermarkedPreview } from "@/lib/images";
import { notifyAdminError } from "@/lib/email";
import { sendDesignReadyEmail } from "@/lib/email";
import { localeFromRequest, PAYMENT_ENABLED } from "@/lib/locale";
import { isFreeFirstDesignEligible } from "@/lib/promo";
import { onDesignUnlocked } from "@/lib/unlock";

export const runtime = "nodejs";

// The Blob store is connected with a "newblob_" prefix in production, so the
// SDK's default BLOB_READ_WRITE_TOKEN lookup misses it. Resolve either name.
const blobToken =
  process.env.BLOB_READ_WRITE_TOKEN || process.env.newblob_READ_WRITE_TOKEN;

function toBuffer(input: string): Buffer {
  return Buffer.from(input.replace(/^data:image\/\w+;base64,/, ""), "base64");
}

export async function POST(request: Request) {
  try {
    const { mode, eventConfig, makeoverConfig, roomAnalysis, products, hotspots, designNarrative, originalImage, generatedImage, selectedItems, removedItems } =
      await request.json();

    if (!products || !originalImage || !generatedImage) {
      return NextResponse.json({ error: "Missing data" }, { status: 400 });
    }

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Please sign in to save your design." }, { status: 401 });
    }
    const userId = session.user.id;
    // Unlock immediately when the market has no payment, or when the user is
    // in the launch promo (first 500 signups get their first design free).
    const locale = localeFromRequest(request);
    const freeMarket = !PAYMENT_ENABLED[locale];
    const promoApplied =
      !!userId && !freeMarket && (await isFreeFirstDesignEligible(userId));
    const isUnlocked = freeMarket || promoApplied;

    const ts = Date.now();
    const originalBuf = toBuffer(originalImage);
    const generatedBuf = toBuffer(generatedImage);

    // Upload masters to public Blob; generate blur placeholders (non-fatal).
    const [originalBlob, generatedBlob] = await Promise.all([
      put(`designs/${ts}-original.jpg`, originalBuf, {
        access: "public",
        contentType: "image/jpeg",
        addRandomSuffix: true,
        token: blobToken,
      }),
      put(`designs/${ts}-generated.png`, generatedBuf, {
        access: "public",
        contentType: "image/png",
        addRandomSuffix: true,
        token: blobToken,
      }),
    ]);

    const [originalBlur, generatedBlur] = await Promise.all([
      makeBlurDataUrl(originalBuf).catch(() => null),
      makeBlurDataUrl(generatedBuf).catch(() => null),
    ]);

    // For locked designs, build + store a watermarked, downscaled preview. The
    // gated image route serves this to non-entitled viewers so the full-res
    // master is never handed out before payment (R1).
    let previewImageUrl: string | null = null;
    if (!isUnlocked) {
      try {
        const previewBuf = await makeWatermarkedPreview(generatedBuf);
        const previewBlob = await put(
          `designs/${ts}-preview.jpg`,
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
        console.error("[save-design] preview generation failed:", e);
      }
    }

    const designId = await saveDesign({
      mode: mode || "space",
      eventConfig: eventConfig || makeoverConfig || null,
      roomAnalysis: roomAnalysis || null,
      products,
      hotspots,
      designNarrative: designNarrative || "",
      originalImageUrl: originalBlob.url,
      generatedImageUrl: generatedBlob.url,
      previewImageUrl,
      originalBlur,
      generatedBlur,
      userId,
      isUnlocked,
      selectedItems: selectedItems || null,
      removedItems: removedItems || null,
    });

    // Designs unlocked at save time (free markets, or the free-first-design promo
    // in a paid market) skip the payment unlock endpoints, so run the shared
    // post-unlock hook here too — otherwise their hotspots stay empty and the
    // shoppable pins don't show.
    if (isUnlocked && designId) {
      onDesignUnlocked(designId);
    }

    if (userId && mode === "event" && eventConfig?.eventDate) {
      await saveEventDate({
        userId,
        eventType: eventConfig.eventType,
        eventLabel: eventConfig.eventLabel,
        eventDate: eventConfig.eventDate,
        honoree: eventConfig.honoree,
      });
    }

    // Email the signed-in user their design + shopping list (post-response,
    // never blocks or fails the save). Only when the design is actually unlocked
    // (free markets / India) — locked US designs are emailed after payment, so
    // we never hand over the shopping list before they pay.
    const email = session?.user?.email;
    if (email && isUnlocked) {
      after(async () => {
        await sendDesignReadyEmail({
          to: email,
          name: session?.user?.name ?? undefined,
          designId,
          mode: mode || "space",
          eventConfig: eventConfig || null,
          designNarrative: designNarrative || "",
          generatedImageUrl: generatedBlob.url,
          products,
        });
      });
    }

    return NextResponse.json({ designId, isUnlocked, promoApplied });
  } catch (error) {
    console.error("Save design failed:", error);
    await notifyAdminError({ route: "save-design", error });
    return NextResponse.json({ error: "Failed to save design" }, { status: 500 });
  }
}
