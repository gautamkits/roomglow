import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { generateDesignImage } from "@/lib/gemini";
import { localeFromRequest, PAYMENT_ENABLED } from "@/lib/locale";
import { rateLimit } from "@/lib/rateLimit";
import { recordImageGen } from "@/lib/db";
import { isAdminEmail } from "@/lib/admin";
import { notifyAdminError } from "@/lib/email";

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

    // Image generation is the costliest step — sign-in required, then a
    // per-user hourly cap so a retry loop / page-refresh can't rack up paid
    // gens (client-side caps reset on refresh). Admins get a higher cap, not a
    // free pass — unbounded admin/testing is what inflated the bill.
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Please sign in to generate a design." }, { status: 401 });
    }
    {
      const limit = isAdminEmail(session.user.email) ? 100 : 30;
      const { ok, retryAfterMs } = rateLimit(`genimg:user:${session.user.id}`, limit, 60 * 60 * 1000);
      if (!ok) {
        return NextResponse.json(
          { error: "You're generating designs very quickly. Please wait a bit and try again." },
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

    // Track the billed image-gen call (restyle vs fresh design) for cost analytics.
    await recordImageGen(styleHint ? "restyle" : "design", session?.user?.id);

    return NextResponse.json({ generatedImage, hotspots });
  } catch (error) {
    console.error("Image generation failed:", error);
    await notifyAdminError({ route: "generate-image", error });
    return NextResponse.json(
      { error: "Failed to generate design" },
      { status: 500 }
    );
  }
}
