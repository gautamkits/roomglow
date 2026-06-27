import { NextResponse } from "next/server";
import crypto from "crypto";

export const runtime = "nodejs";

// Instamojo signs each webhook with an HMAC-SHA1 ("mac") over the values of all
// other POST fields, sorted by key (case-insensitive), joined by "|", keyed by
// the account's private salt. Verifying this is REQUIRED before this endpoint
// is ever allowed to unlock a design / grant entitlement.
function verifyInstamojoMac(
  fields: Record<string, string>,
  mac: string,
  salt: string
): boolean {
  const message = Object.keys(fields)
    .filter((k) => k !== "mac")
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    .map((k) => fields[k])
    .join("|");
  const expected = crypto.createHmac("sha1", salt).update(message).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(mac));
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const fields: Record<string, string> = {};
    for (const [k, v] of form.entries()) fields[k] = String(v);

    const salt = process.env.INSTAMOJO_SALT;
    const mac = fields.mac;
    // When a salt is configured, reject any webhook whose signature doesn't
    // verify. (No entitlement is granted here yet — but this guard must be in
    // place before any unlock logic is added.)
    if (salt) {
      if (!mac || !verifyInstamojoMac(fields, mac, salt)) {
        console.warn("[payment-webhook] invalid Instamojo signature");
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    }

    console.log("Instamojo webhook:", {
      paymentId: fields.payment_id,
      status: fields.status,
      verified: !!salt,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json({ error: "Webhook failed" }, { status: 500 });
  }
}
