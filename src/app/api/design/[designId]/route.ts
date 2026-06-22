import { NextResponse } from "next/server";
import { getDesign } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ designId: string }> }
) {
  try {
    const { designId } = await params;
    const design = await getDesign(designId);

    if (!design) {
      return NextResponse.json({ error: "Design not found" }, { status: 404 });
    }

    return NextResponse.json(design);
  } catch (error) {
    console.error("Get design failed:", error);
    return NextResponse.json({ error: "Failed to fetch design" }, { status: 500 });
  }
}
