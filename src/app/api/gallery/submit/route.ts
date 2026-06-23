import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requestGalleryPublish } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const { designId } = await request.json();
    if (!designId) {
      return NextResponse.json({ error: "Missing designId" }, { status: 400 });
    }
    const ok = await requestGalleryPublish(designId, session.user.id);
    if (!ok) {
      return NextResponse.json(
        { error: "Could not submit (not owner or already submitted)" },
        { status: 400 }
      );
    }
    return NextResponse.json({ status: "pending" });
  } catch (error) {
    console.error("Gallery submit failed:", error);
    return NextResponse.json({ error: "Failed to submit" }, { status: 500 });
  }
}
