import { NextResponse } from "next/server";
import { getFeatures } from "@/lib/db";

export const revalidate = 60;

export async function GET() {
  try {
    const features = await getFeatures();
    return NextResponse.json(features);
  } catch {
    return NextResponse.json({ makeover: false });
  }
}
