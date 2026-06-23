import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { getPendingDesigns } from "@/lib/db";

export async function GET() {
  try {
    const session = await auth();
    if (!isAdminEmail(session?.user?.email)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const designs = await getPendingDesigns();
    return NextResponse.json({ designs });
  } catch (error) {
    console.error("Admin pending failed:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
