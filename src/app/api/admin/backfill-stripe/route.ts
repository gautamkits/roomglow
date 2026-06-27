import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { stripe } from "@/lib/stripe";
import { recordStripeSale } from "@/lib/db";

export const runtime = "nodejs";

// One-time recovery: pull recent paid Stripe checkout sessions and record any
// that never made it into the payments table. Idempotent (ON CONFLICT).
export async function POST() {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    let recorded = 0;
    let scanned = 0;
    const sessions = await stripe.checkout.sessions.list({ limit: 100 });
    for (const s of sessions.data) {
      scanned++;
      const designId = s.metadata?.designId;
      const userId = s.metadata?.userId;
      if (
        s.payment_status === "paid" &&
        designId &&
        userId &&
        s.amount_total != null
      ) {
        await recordStripeSale({
          userId,
          designId,
          amount: s.amount_total,
          currency: s.currency || "usd",
          stripeSessionId: s.id,
        });
        recorded++;
      }
    }
    return NextResponse.json({ scanned, recorded });
  } catch (err) {
    console.error("[admin/backfill-stripe]", err);
    return NextResponse.json({ error: "Backfill failed" }, { status: 500 });
  }
}
