import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { generateDesignImage } from "@/lib/gemini";
import { localeFromRequest, PAYMENT_ENABLED } from "@/lib/locale";
import { rateLimit, clientIp } from "@/lib/rateLimit";

export async function POST(request: Request) {
  try {
    const { originalImage, products, eventContext, styleHint } = await request.json();
    if (!originalImage || !products?.length) {
      return NextResponse.json({ error: "Missing data" }, { status: 400 });
    }

    // Detect hotspots only when they'll actually be shown: a restyle (styleHint)
    // always targets an already-unlocked design, and a fresh create only ends up
    // unlocked in free markets for a signed-in user. Locked designs defer
    // detection to unlock time (P1-b).
    const session = await auth();

    // Anonymous visitors can design up to the paywall (U1), but image
    // generation is the costliest step — cap it per-IP to limit abuse.
    if (!session?.user?.id) {
      const { ok, retryAfterMs } = rateLimit(`genimg:${clientIp(request)}`, 6, 60 * 60 * 1000);
      if (!ok) {
        return NextResponse.json(
          { error: "You've reached the free limit. Sign in to keep designing." },
          { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } }
        );
      }
    }

    const locale = localeFromRequest(request);
    const willBeUnlocked = !!session?.user?.id && !PAYMENT_ENABLED[locale];
    const detect = !!styleHint || willBeUnlocked;

    const base64 = originalImage.replace(/^data:image\/\w+;base64,/, "");
    const { generatedImage, hotspots } = await generateDesignImage(
      base64,
      products,
      eventContext,
      styleHint || undefined,
      detect
    );

    return NextResponse.json({ generatedImage, hotspots });
  } catch (error) {
    console.error("Image generation failed:", error);
    return NextResponse.json(
      { error: "Failed to generate design" },
      { status: 500 }
    );
  }
}
