import { NextResponse, after } from "next/server";
import { auth } from "@/auth";
import { saveDecorLead } from "@/lib/db";
import { sendDecorLeadNotification, notifyAdminError } from "@/lib/email";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { localeFromRequest } from "@/lib/locale";
import { DECOR_SERVICE } from "@/lib/decor";

export const runtime = "nodejs";

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

// Waitlist signups for the "book a decorator" service. India (IN) only —
// enforced here server-side as the source of truth (the client also hides the
// CTA for US). Mirrors /api/contact: honeypot + email validation + rate limit.
export async function POST(request: Request) {
  const locale = localeFromRequest(request);
  try {
    let body: {
      designId?: string;
      eventLabel?: string;
      email?: string;
      phone?: string;
      eventDate?: string;
      city?: string;
      website?: string; // honeypot — must stay empty
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    // Honeypot: bots fill hidden fields. Pretend success so they don't retry.
    if (body.website && body.website.trim() !== "") {
      return NextResponse.json({ ok: true });
    }

    // India-only: silently no-op for other locales (no row, no email).
    if (locale !== "IN") {
      return NextResponse.json({ ok: true });
    }

    const email = (body.email || "").trim();
    const phone = (body.phone || "").trim();
    const eventLabel = (body.eventLabel || "").trim();
    const eventDate = (body.eventDate || "").trim();
    const city = (body.city || "").trim();
    const designId = (body.designId || "").trim();

    if (!email || !isEmail(email)) {
      return NextResponse.json({ error: "Please enter a valid email." }, { status: 400 });
    }
    if (
      email.length > 200 ||
      phone.length > 40 ||
      eventLabel.length > 120 ||
      eventDate.length > 40 ||
      city.length > 120 ||
      designId.length > 100
    ) {
      return NextResponse.json({ error: "One of those fields is too long." }, { status: 400 });
    }

    // Rate limit: 5 signups per IP per 10 minutes.
    const ip = clientIp(request);
    if (!rateLimit(`decor-lead:ip:${ip}`, 5, 10 * 60 * 1000).ok) {
      return NextResponse.json(
        { error: "You've joined a few times already — please try again later." },
        { status: 429 }
      );
    }

    const session = await auth();
    const userId = session?.user?.id || null;

    await saveDecorLead({
      designId: designId || null,
      eventLabel: eventLabel || null,
      email,
      phone: phone || null,
      eventDate: eventDate || null,
      city: city || null,
      locale,
      quotedPriceMinor: DECOR_SERVICE.priceMinor,
      currency: DECOR_SERVICE.currency,
      durationLabel: DECOR_SERVICE.durationLabel,
      userId,
    });

    // Fire-and-forget team notification.
    after(() =>
      sendDecorLeadNotification({
        email,
        phone,
        eventLabel,
        eventDate,
        city,
        locale,
        designId,
        quotedPriceMinor: DECOR_SERVICE.priceMinor,
        currency: DECOR_SERVICE.currency,
        durationLabel: DECOR_SERVICE.durationLabel,
      }).catch(() => {})
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    await notifyAdminError({ route: "decor-leads", error, locale }).catch(() => {});
    return NextResponse.json(
      { error: "Couldn't join right now. Please try again shortly." },
      { status: 500 }
    );
  }
}
