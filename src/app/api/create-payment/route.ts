import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createPayment } from "@/lib/db";
import { createPaymentRequest } from "@/lib/instamojo";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { designId, amount } = await request.json();
    if (!designId || !amount) {
      return NextResponse.json({ error: "Missing data" }, { status: 400 });
    }

    const amountPaise = amount * 100;
    const paymentId = await createPayment(session.user.id, designId, amountPaise);

    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const { longUrl } = await createPaymentRequest({
      amount,
      purpose: `Noosho Design - ${designId.slice(0, 8)}`,
      buyerName: session.user.name || "User",
      email: session.user.email || "",
      redirectUrl: `${baseUrl}/api/payment-callback?paymentId=${paymentId}&designId=${designId}`,
      webhookUrl: `${baseUrl}/api/payment-webhook`,
    });

    return NextResponse.json({ paymentUrl: longUrl, paymentId });
  } catch (error) {
    console.error("Create payment failed:", error);
    return NextResponse.json({ error: "Failed to create payment" }, { status: 500 });
  }
}
