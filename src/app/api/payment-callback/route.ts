import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { completePayment, unlockDesign, getDesign, saveEventDate } from "@/lib/db";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const paymentId = url.searchParams.get("paymentId");
  const designId = url.searchParams.get("designId");
  const paymentStatus = url.searchParams.get("payment_status");

  if (!paymentId || !designId) {
    return NextResponse.redirect(new URL("/?error=invalid_payment", request.url));
  }

  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.redirect(new URL("/?error=not_authenticated", request.url));
    }

    if (paymentStatus === "Credit") {
      const instamojoPaymentId = url.searchParams.get("payment_id") || "";
      await completePayment(paymentId, instamojoPaymentId);
      await unlockDesign(designId, session.user.id);

      const design = await getDesign(designId);
      if (design?.mode === "event" && design.event_config) {
        const cfg = typeof design.event_config === "string"
          ? JSON.parse(design.event_config)
          : design.event_config;
        if (cfg.eventDate) {
          await saveEventDate({
            userId: session.user.id,
            eventType: cfg.eventType,
            eventLabel: cfg.eventLabel,
            eventDate: cfg.eventDate,
            honoree: cfg.honoree,
          });
        }
      }
    }

    return NextResponse.redirect(new URL(`/design/${designId}`, request.url));
  } catch (error) {
    console.error("Payment callback error:", error);
    return NextResponse.redirect(new URL("/?error=payment_failed", request.url));
  }
}
