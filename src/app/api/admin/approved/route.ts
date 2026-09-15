import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { getGalleryCards } from "@/lib/db";

export async function GET() {
  try {
    const session = await auth();
    if (!isAdminEmail(session?.user?.email)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const designs = await getGalleryCards({ sort: "newest", limit: 200 });
    return NextResponse.json({ designs });
  } catch (error) {
    console.error("Admin approved list failed:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
