import { NextResponse } from "next/server";
import { analyzeRoom } from "@/lib/gemini";

export async function POST(request: Request) {
  try {
    const { image, eventContext } = await request.json();
    if (!image) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    const base64 = image.replace(/^data:image\/\w+;base64,/, "");
    const analysisJson = await analyzeRoom(base64, eventContext);
    const analysis = JSON.parse(analysisJson);

    return NextResponse.json(analysis);
  } catch (error) {
    console.error("Room analysis failed:", error);
    return NextResponse.json(
      { error: "Failed to analyze room" },
      { status: 500 }
    );
  }
}
