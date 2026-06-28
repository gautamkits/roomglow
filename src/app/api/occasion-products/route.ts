import { NextResponse } from "next/server";
import { localeFromRequest } from "@/lib/locale";
import { getCompletionProducts } from "@/lib/occasion";
import { notifyAdminError } from "@/lib/email";

export async function POST(request: Request) {
  try {
    const { eventId, subTheme } = await request.json();
    if (!eventId) {
      return NextResponse.json({ error: "Missing eventId" }, { status: 400 });
    }
    const locale = localeFromRequest(request);
    const products = await getCompletionProducts(eventId, locale, subTheme);
    return NextResponse.json({ products });
  } catch (error) {
    console.error("Occasion products failed:", error);
    await notifyAdminError({ route: "occasion-products", error });
    return NextResponse.json(
      { error: "Failed to load occasion products" },
      { status: 500 }
    );
  }
}
