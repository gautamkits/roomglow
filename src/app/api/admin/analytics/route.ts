import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { getAnalyticsStats } from "@/lib/db";

export async function GET() {
  try {
    const session = await auth();
    if (!isAdminEmail(session?.user?.email)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const stats = await getAnalyticsStats();
    return NextResponse.json(stats);
  } catch (error) {
    console.error("Analytics failed:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
