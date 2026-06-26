import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { createCoupon } from "@/lib/db";

export async function POST(request: Request) {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const body = await request.json();
    const code = String(body.code || "").trim();
    if (!code) return NextResponse.json({ error: "Code required" }, { status: 400 });

    const discountType = body.discountType === "fixed" ? "fixed" : "percent";
    const discountValue = Math.round(Number(body.discountValue));
    if (!discountValue || discountValue <= 0) {
      return NextResponse.json({ error: "Invalid discount value" }, { status: 400 });
    }
    if (discountType === "percent" && discountValue > 100) {
      return NextResponse.json({ error: "Percent can't exceed 100" }, { status: 400 });
    }

    await createCoupon({
      code,
      discountType,
      discountValue,
      locale: body.locale || null,
      active: body.active ?? true,
      expiresAt: body.expiresAt || null,
      maxUses: body.maxUses ? Math.round(Number(body.maxUses)) : null,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin/coupons]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
