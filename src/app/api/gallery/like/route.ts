import { NextResponse } from "next/server";
import { toggleLike } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const { designId, fingerprint } = await request.json();
    if (!designId || !fingerprint) {
      return NextResponse.json({ error: "Missing data" }, { status: 400 });
    }
    const result = await toggleLike(designId, fingerprint);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Like toggle failed:", error);
    return NextResponse.json({ error: "Failed to like" }, { status: 500 });
  }
}
