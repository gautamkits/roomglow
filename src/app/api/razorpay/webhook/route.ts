import { NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/razorpay";
import { unlockDesign } from "@/lib/db";
import { onDesignUnlocked } from "@/lib/unlock";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.text();
    const signature = request.headers.get("x-razorpay-signature") ?? "";

    if (!verifyWebhookSignature(body, signature)) {
      console.warn("[razorpay/webhook] invalid signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const event = JSON.parse(body);

    if (event.event === "payment.captured") {
      const payment = event.payload?.payment?.entity;
      const designId = payment?.notes?.designId;
      const userId = payment?.notes?.userId;

      if (designId && userId) {
        await unlockDesign(designId, userId).catch((e) =>
          console.error("[razorpay/webhook] unlockDesign failed:", e)
        );
        onDesignUnlocked(designId);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[razorpay/webhook]", err);
    return NextResponse.json({ error: "Webhook failed" }, { status: 500 });
  }
}
