import { NextResponse, after } from "next/server";
import { auth } from "@/auth";
import { getDesign, saveDesignFeedback, type DesignRating } from "@/lib/db";
import { notifyAdminFeedback } from "@/lib/email";
import { localeFromRequest } from "@/lib/locale";
import { rateLimit, clientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";

const RATINGS: DesignRating[] = ["happy", "ok", "sad"];
// Anything short of happy is worth a look — the whole point is learning what
// went wrong, and "ok" is a quieter version of the same signal.
const ALERT_ON: DesignRating[] = ["sad", "ok"];

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Please sign in." }, { status: 401 });
    }
    if (!rateLimit(`feedback:${clientIp(request)}`, 30, 10 * 60 * 1000).ok) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    const { designId, rating, reason } = (await request.json()) as {
      designId?: string;
      rating?: string;
      reason?: string;
    };
    if (!designId || !RATINGS.includes(rating as DesignRating)) {
      return NextResponse.json({ error: "Missing data" }, { status: 400 });
    }

    // getDesign casts to uuid, so a malformed id throws rather than returning
    // null — guard here instead of letting it 500.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(designId)) {
      return NextResponse.json({ error: "Bad design id" }, { status: 400 });
    }

    const trimmed = (reason ?? "").trim().slice(0, 500);
    const saved = await saveDesignFeedback({
      designId,
      userId: session.user.id,
      rating: rating as DesignRating,
      reason: trimmed || null,
    });
    if (!saved.ok) {
      return NextResponse.json({ error: "Could not save feedback" }, { status: 500 });
    }

    // Alert admins post-response so a slow mailer never delays the tap. Only on
    // a NEW low rating: re-tapping the same face must not re-alert, and adding a
    // reason to an existing complaint sends one follow-up, not a duplicate.
    if (ALERT_ON.includes(rating as DesignRating) && (saved.isNew || trimmed)) {
      const locale = localeFromRequest(request);
      after(async () => {
        const design = await getDesign(designId).catch(() => null);
        const cfg = design?.event_config
          ? typeof design.event_config === "string"
            ? JSON.parse(design.event_config)
            : design.event_config
          : null;
        await notifyAdminFeedback({
          designId,
          rating: rating as string,
          reason: trimmed,
          userEmail: session.user?.email ?? null,
          mode: design?.mode ?? null,
          eventLabel: cfg?.eventLabel ?? null,
          generatedImageUrl: design?.generated_image_url ?? null,
          locale,
        });
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Design feedback failed:", error);
    return NextResponse.json({ error: "Failed to save feedback" }, { status: 500 });
  }
}
