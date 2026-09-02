import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { getAbandonedCheckouts } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!isAdminEmail(session?.user?.email)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get("limit")) || 50;
    return NextResponse.json({ intents: await getAbandonedCheckouts(limit) });
  } catch (error) {
    console.error("Admin abandoned failed:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
