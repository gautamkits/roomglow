import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { setGalleryStatus } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!isAdminEmail(session?.user?.email)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { designId, action } = await request.json();
    if (!designId || !["approve", "reject"].includes(action)) {
      return NextResponse.json({ error: "Bad request" }, { status: 400 });
    }
    await setGalleryStatus(designId, action === "approve" ? "approved" : "rejected");
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Admin review failed:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
