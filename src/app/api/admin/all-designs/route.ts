import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { getAllDesigns } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!isAdminEmail(session?.user?.email)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get("limit")) || 60;
    const offset = Number(searchParams.get("offset")) || 0;
    const designs = await getAllDesigns({ limit, offset });
    return NextResponse.json({ designs });
  } catch (error) {
    console.error("Admin all-designs failed:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
