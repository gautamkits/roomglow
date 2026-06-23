import { NextResponse } from "next/server";
import { getGalleryDesigns } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const mode = url.searchParams.get("mode") || undefined;
    const sort = url.searchParams.get("sort") || "top";
    const designs = await getGalleryDesigns({ mode, sort });
    return NextResponse.json({ designs });
  } catch (error) {
    console.error("Gallery list failed:", error);
    return NextResponse.json({ error: "Failed to load gallery" }, { status: 500 });
  }
}
