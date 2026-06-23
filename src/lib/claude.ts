import { GoogleGenAI, Type } from "@google/genai";
import type { RoomAnalysis } from "./types";

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY! });

const recommendationSchema = {
  type: Type.OBJECT,
  properties: {
    designVision: { type: Type.STRING },
    products: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          category: { type: Type.STRING },
          searchQuery: { type: Type.STRING },
          placement: { type: Type.STRING },
          reason: { type: Type.STRING },
          colorSuggestion: { type: Type.STRING },
        },
        required: [
          "category",
          "searchQuery",
          "placement",
          "reason",
          "colorSuggestion",
        ],
      },
    },
  },
  required: ["designVision", "products"],
};

export async function recommendProducts(
  roomAnalysis: RoomAnalysis,
  userAnswers: Record<string, string>,
  selectedProductTypes: string[],
  eventContext?: string
): Promise<string> {
  const productTypesList =
    selectedProductTypes.length > 0
      ? `\nThe user has specifically requested these item types: ${selectedProductTypes.join(", ")}. You MUST include one product for each of these types. You may suggest additional complementary items if needed.`
      : "";

  const analysisBlock = `Space Analysis:
- Type: ${roomAnalysis.roomType}
- Current Style: ${roomAnalysis.currentStyle}
- Size: ${roomAnalysis.dimensions}
- Existing Furniture/Surfaces: ${roomAnalysis.existingFurniture.join(", ")}
- Lighting: ${roomAnalysis.lightingCondition}
- Current Colors: ${roomAnalysis.colorPalette.join(", ")}
${productTypesList}`;

  const spacePrompt = `You are an expert interior designer. Based on the space analysis and user preferences below, create a design vision and recommend specific products that would transform this space.

${analysisBlock}

Think like a professional designer:
1. First define a clear design direction (color scheme, style, mood)
2. Then pick products that work TOGETHER as a cohesive set
3. Each product should complement the others AND the existing room

For each product provide:
- category: specific product type, e.g. 'geometric patterned area rug'
- searchQuery: SHORT Amazon India search query (3-5 words max, e.g. 'geometric rug grey yellow'). Keep it generic enough to find results.
- placement: where in the room, e.g. 'center of the room in front of the sofa'
- reason: why this product improves the space and how it connects to the others
- colorSuggestion: specific color/finish, e.g. 'grey with mustard yellow accents'

Also write a clear 2-3 sentence designVision describing the overall color palette, style theme, and mood.`;

  const eventPrompt = `You are an expert event decorator. ${eventContext}

Based on the space analysis and the requested items below, create a decoration vision and recommend specific DECORATION products to style this space for the event.

${analysisBlock}

Think like a professional party stylist:
1. Define a clear decoration direction matching the occasion, theme, and colors
2. Pick decorations that work TOGETHER as a cohesive festive set
3. Tie each item to a zone in the space

For each product provide:
- category: specific decoration type for THIS occasion (e.g. for an Annaprasan: 'annaprasan traditional backdrop')
- searchQuery: SHORT Amazon India search query (3-5 words max) that MUST include the occasion named above. For example, an Annaprasan query should read like 'annaprasan decoration backdrop' or 'annaprasan balloon kit' — NOT 'birthday' anything. CRITICAL: never put a DIFFERENT occasion's name in the query (do not write "birthday" unless the event itself is a birthday). Include the theme/colors where helpful, but keep it generic enough to return results.
- placement: which zone in the space, e.g. 'on the wall behind the main table'
- reason: how this decoration supports the theme and connects to the others
- colorSuggestion: specific colors/finish matching the theme

Also write a clear 2-3 sentence designVision describing the styling — color palette, theme, and mood.`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        role: "user",
        parts: [{ text: eventContext ? eventPrompt : spacePrompt }],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: recommendationSchema,
    },
  });

  return response.text ?? "";
}
