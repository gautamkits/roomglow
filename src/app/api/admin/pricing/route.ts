import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { getAllPricing, listCoupons, updatePricing } from "@/lib/db";

async function requireAdmin() {
  const session = await auth();
  return isAdminEmail(session?.user?.email);
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const [pricing, coupons] = await Promise.all([getAllPricing(), listCoupons()]);
  return NextResponse.json({ pricing, coupons });
}

export async function POST(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const { locale, actualAmount, saleAmount } = await request.json();
    if (!locale || actualAmount == null || saleAmount == null) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    if (saleAmount > actualAmount) {
      return NextResponse.json(
        { error: "Sale price can't exceed the actual price" },
        { status: 400 }
      );
    }
    await updatePricing(locale, Math.round(actualAmount), Math.round(saleAmount));
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin/pricing]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
