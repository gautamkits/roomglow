import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.formData();
    const paymentId = body.get("payment_id") as string;
    const status = body.get("status") as string;

    console.log("Instamojo webhook:", { paymentId, status });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json({ error: "Webhook failed" }, { status: 500 });
  }
}
