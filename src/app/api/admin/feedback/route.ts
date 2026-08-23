import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { getFeedbackDesigns } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!isAdminEmail(session?.user?.email)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get("limit")) || 40;
    const offset = Number(searchParams.get("offset")) || 0;
    // Default to the complaints — the happy ones are for the analytics panel.
    const badOnly = searchParams.get("all") !== "1";
    const designs = await getFeedbackDesigns({ limit, offset, badOnly });
    return NextResponse.json({ designs });
  } catch (error) {
    console.error("Admin feedback failed:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
