import { NextResponse } from "next/server";
import { generateDesignImage } from "@/lib/gemini";

export async function POST(request: Request) {
  try {
    const { originalImage, products, eventContext, styleHint } = await request.json();
    if (!originalImage || !products?.length) {
      return NextResponse.json({ error: "Missing data" }, { status: 400 });
    }

    const base64 = originalImage.replace(/^data:image\/\w+;base64,/, "");
    const { generatedImage, hotspots } = await generateDesignImage(
      base64,
      products,
      eventContext,
      styleHint || undefined
    );

    return NextResponse.json({ generatedImage, hotspots });
  } catch (error) {
    console.error("Image generation failed:", error);
    return NextResponse.json(
      { error: "Failed to generate design" },
      { status: 500 }
    );
  }
}
