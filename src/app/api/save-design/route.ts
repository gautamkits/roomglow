import { NextResponse, after } from "next/server";
import { put } from "@vercel/blob";
import { auth } from "@/auth";
import { saveDesign, saveEventDate } from "@/lib/db";
import { makeBlurDataUrl } from "@/lib/images";
import { sendDesignReadyEmail } from "@/lib/email";
import { localeFromRequest, PAYMENT_ENABLED } from "@/lib/locale";

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
    const { mode, eventConfig, roomAnalysis, products, hotspots, designNarrative, originalImage, generatedImage, selectedItems } =
      await request.json();

    if (!products || !originalImage || !generatedImage) {
      return NextResponse.json({ error: "Missing data" }, { status: 400 });
    }

    const session = await auth();
    const userId = session?.user?.id ?? null;
    // In markets without payment (India, until Instamojo is approved), a
    // signed-in user's design unlocks immediately. Where payment is enabled
    // (US/Stripe), it stays locked until paid.
    const locale = localeFromRequest(request);
    const isUnlocked = !!userId && !PAYMENT_ENABLED[locale];

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

    const designId = await saveDesign({
      mode: mode || "space",
      eventConfig: eventConfig || null,
      roomAnalysis: roomAnalysis || null,
      products,
      hotspots,
      designNarrative: designNarrative || "",
      originalImageUrl: originalBlob.url,
      generatedImageUrl: generatedBlob.url,
      originalBlur,
      generatedBlur,
      userId,
      isUnlocked,
      selectedItems: selectedItems || null,
    });

    if (userId && mode === "event" && eventConfig?.eventDate) {
      await saveEventDate({
        userId,
        eventType: eventConfig.eventType,
        eventLabel: eventConfig.honoree || eventConfig.eventLabel,
        eventDate: eventConfig.eventDate,
        honoree: eventConfig.honoree,
      });
    }

    // Email the signed-in user their design + shopping list (post-response,
    // never blocks or fails the save).
    const email = session?.user?.email;
    if (email) {
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

    return NextResponse.json({ designId, isUnlocked });
  } catch (error) {
    console.error("Save design failed:", error);
    return NextResponse.json({ error: "Failed to save design" }, { status: 500 });
  }
}
