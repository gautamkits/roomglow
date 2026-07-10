import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { generateDesignImage } from "@/lib/gemini";
import { localeFromRequest, PAYMENT_ENABLED } from "@/lib/locale";
import { rateLimit } from "@/lib/rateLimit";
import { recordImageGen } from "@/lib/db";
import { isAdminEmail } from "@/lib/admin";
import { isFreeFirstDesignEligible } from "@/lib/promo";
import { notifyAdminError } from "@/lib/email";

export async function POST(request: Request) {
  try {
    const { originalImage, products, eventContext, styleHint, geometry } = await request.json();
    if (!originalImage || !products?.length) {
      return NextResponse.json({ error: "Missing data" }, { status: 400 });
    }

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

    // Detect hotspots up front only when the design will actually be entitled —
    // otherwise defer to unlock time to save the AI cost (P1-b). A restyle
    // (styleHint) always targets an unlocked design. A fresh create is entitled
    // in a free market, for an admin (entitled everywhere), or for a promo user
    // (first design free) — all of which show the design unlocked, so the pins
    // must exist. Locked paid designs get pins later via ensureHotspots.
    const locale = localeFromRequest(request);
    const willBeUnlocked =
      !PAYMENT_ENABLED[locale] ||
      isAdminEmail(session.user.email) ||
      (await isFreeFirstDesignEligible(session.user.id));
    const detect = !!styleHint || willBeUnlocked;

    const base64 = originalImage.replace(/^data:image\/\w+;base64,/, "");
    const { generatedImage, hotspots } = await generateDesignImage(
      base64,
      products,
      eventContext,
      styleHint || undefined,
      detect,
      geometry || undefined
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
