import { NextResponse } from "next/server";
import { localeFromRequest } from "@/lib/locale";
import { getMakeoverExtras } from "@/lib/makeoverExtras";
import { notifyAdminError } from "@/lib/email";

export async function POST(request: Request) {
  try {
    const { styleId, gender } = await request.json();
    if (!styleId) {
      return NextResponse.json({ error: "Missing styleId" }, { status: 400 });
    }
    const locale = localeFromRequest(request);
    const products = await getMakeoverExtras(styleId, locale, gender);
    return NextResponse.json({ products });
  } catch (error) {
    console.error("Makeover products failed:", error);
    await notifyAdminError({ route: "makeover-products", error });
    return NextResponse.json(
      { error: "Failed to load makeover products" },
      { status: 500 }
    );
  }
}
