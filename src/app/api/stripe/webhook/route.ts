import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { unlockDesign, recordStripeSale } from "@/lib/db";
import { onDesignUnlocked } from "@/lib/unlock";

export const runtime = "nodejs";

// Backup webhook — idempotent unlock in case the success redirect failed.
export async function POST(request: Request) {
  const sig = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event;
  try {
    const raw = await request.arrayBuffer();
    event = stripe.webhooks.constructEvent(Buffer.from(raw), sig, webhookSecret);
  } catch (err) {
    console.error("[stripe/webhook] signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const { designId, userId } = session.metadata ?? {};
    if (designId && userId && session.payment_status === "paid") {
      await unlockDesign(designId, userId).catch((e) =>
        console.error("[stripe/webhook] unlock failed:", e)
      );
      if (session.amount_total != null) {
        await recordStripeSale({
          userId,
          designId,
          amount: session.amount_total,
          currency: session.currency || "usd",
          stripeSessionId: session.id,
        }).catch((e) => console.error("[stripe/webhook] recordSale failed:", e));
      }
      onDesignUnlocked(designId);
    }
  }

  return NextResponse.json({ received: true });
}
