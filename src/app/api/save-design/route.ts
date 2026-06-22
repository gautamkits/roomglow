import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { saveDesign, saveEventDate } from "@/lib/db";

// Ensure a base64 string is a usable data URL for <img src>
function toDataUrl(input: string, mime: string): string {
  if (input.startsWith("data:")) return input;
  return `data:${mime};base64,${input}`;
}

export async function POST(request: Request) {
  try {
    const { mode, eventConfig, roomAnalysis, products, hotspots, designNarrative, originalImage, generatedImage } =
      await request.json();

    if (!products || !originalImage || !generatedImage) {
      return NextResponse.json({ error: "Missing data" }, { status: 400 });
    }

    const session = await auth();
    const userId = session?.user?.id ?? null;
    const isUnlocked = !!userId;

    // Store images as data URLs directly in Postgres. (Migrate to a public
    // Vercel Blob store later for CDN delivery + smaller DB footprint.)
    const designId = await saveDesign({
      mode: mode || "space",
      eventConfig: eventConfig || null,
      roomAnalysis: roomAnalysis || null,
      products,
      hotspots,
      designNarrative: designNarrative || "",
      originalImageUrl: toDataUrl(originalImage, "image/jpeg"),
      generatedImageUrl: toDataUrl(generatedImage, "image/png"),
      userId,
      isUnlocked,
    });

    // If a signed-in user creates an event design with a date, capture it
    if (userId && mode === "event" && eventConfig?.eventDate) {
      await saveEventDate({
        userId,
        eventType: eventConfig.eventType,
        eventLabel: eventConfig.honoree || eventConfig.eventLabel,
        eventDate: eventConfig.eventDate,
        honoree: eventConfig.honoree,
      });
    }

    return NextResponse.json({ designId, isUnlocked });
  } catch (error) {
    console.error("Save design failed:", error);
    return NextResponse.json({ error: "Failed to save design" }, { status: 500 });
  }
}
