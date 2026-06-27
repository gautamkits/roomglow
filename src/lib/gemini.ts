import { GoogleGenAI, Type } from "@google/genai";
import type { RoomAnalysis } from "./types";

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY! });

function parseJson<T>(text: string | undefined, context: string): T {
  if (!text) throw new Error(`${context}: empty response from model`);
  try {
    return JSON.parse(text) as T;
  } catch {
    // Fallback: strip code fences if the model wrapped output despite schema
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    try {
      return JSON.parse(cleaned) as T;
    } catch {
      throw new Error(`${context}: model did not return valid JSON`);
    }
  }
}

const suggestedProductSchema = {
  type: Type.OBJECT,
  properties: {
    id: { type: Type.STRING },
    label: { type: Type.STRING },
    description: { type: Type.STRING },
    icon: { type: Type.STRING },
  },
  required: ["id", "label", "description", "icon"],
};

const roomAnalysisSchema = {
  type: Type.OBJECT,
  properties: {
    roomType: { type: Type.STRING },
    currentStyle: { type: Type.STRING },
    dimensions: { type: Type.STRING },
    existingFurniture: { type: Type.ARRAY, items: { type: Type.STRING } },
    lightingCondition: { type: Type.STRING },
    colorPalette: { type: Type.ARRAY, items: { type: Type.STRING } },
    suggestedProducts: { type: Type.ARRAY, items: suggestedProductSchema },
  },
  required: [
    "roomType",
    "currentStyle",
    "dimensions",
    "existingFurniture",
    "lightingCondition",
    "colorPalette",
    "suggestedProducts",
  ],
};

export async function analyzeRoom(
  imageBase64: string,
  eventContext?: string
): Promise<string> {
  const spaceInstructions = `You are an interior design analyst. Carefully analyze this room photo. Pay close attention to what ACTUALLY exists in the room — the furniture, walls, windows (or lack of), floors, lighting fixtures, etc.

Fill in:
- roomType: "living room" | "bedroom" | "kitchen" | etc
- currentStyle: "modern" | "traditional" | "minimalist" | etc
- dimensions: "small" | "medium" | "large"
- existingFurniture: array of items you actually see
- lightingCondition: "bright" | "moderate" | "dim"
- colorPalette: 3 hex colors representing the room
- suggestedProducts: 6-8 products

CRITICAL RULES for suggestedProducts:
- Suggest products that can REALISTICALLY be added to THIS room
- ONLY suggest products that make sense for what you see:
  - Do NOT suggest curtains/drapes if there are NO windows visible
  - Do NOT suggest a new sofa/couch if one already exists
  - Do NOT suggest items that would require structural changes
- Focus on ADDITIVE items: wall art for bare walls, rugs for bare floors, lamps for dim areas, side tables for empty corners, throw pillows for existing furniture, plants for empty spots, shelves for storage
- Each "description" must reference what you ACTUALLY see in the photo
- "icon" is a single relevant emoji character
- "id" is a short snake_case identifier`;

  const eventInstructions = `You are an event decoration planner. ${eventContext}

Analyze this photo of the space where the event will be held. Note the existing surfaces and zones.

Fill in:
- roomType: the kind of space (e.g. "living room", "hall", "backyard")
- currentStyle: the current look of the space
- dimensions: "small" | "medium" | "large"
- existingFurniture: key furniture/surfaces you see (sofa, table, wall, etc.)
- lightingCondition: "bright" | "moderate" | "dim"
- colorPalette: 3 hex colors representing the space
- suggestedProducts: 6-8 EVENT DECORATION items

CRITICAL RULES for suggestedProducts:
- Suggest ONLY event DECORATIONS appropriate to the occasion and theme — NOT permanent furniture
- Think in decoratable ZONES you can see: focal/backdrop wall, table surfaces, entryway, floor & ceiling for hanging items
- Examples: balloon sets/arches, themed backdrop or banner, fairy/string lights, table centerpiece, garlands, themed props, cake-table decor, welcome sign
- Match the theme and colors specified above
- Each "description" must reference a zone you ACTUALLY see in the photo (e.g. "balloon arch for the bare wall behind the sofa")
- "icon" is a single relevant emoji character
- "id" is a short snake_case identifier`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: "image/jpeg", data: imageBase64 } },
          { text: eventContext ? eventInstructions : spaceInstructions },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: roomAnalysisSchema,
    },
  });

  return response.text ?? "";
}

export interface AmazonCandidate {
  title: string;
  price: string;
  imageUrl: string;
  affiliateUrl: string;
  rating: number;
  asin: string;
}

export interface CategoryCandidates {
  category: string;
  placement: string;
  reason: string;
  colorSuggestion: string;
  candidates: AmazonCandidate[];
}

const curationSchema = {
  type: Type.OBJECT,
  properties: {
    selections: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          categoryIndex: { type: Type.INTEGER },
          optionIndex: { type: Type.INTEGER },
          reason: { type: Type.STRING },
        },
        required: ["categoryIndex", "optionIndex", "reason"],
      },
    },
    designNarrative: { type: Type.STRING },
  },
  required: ["selections", "designNarrative"],
};

export async function curateProducts(
  roomImageBase64: string,
  designVision: string,
  categories: CategoryCandidates[],
  budgetInstruction?: string
): Promise<string> {
  const candidateDescriptions = categories
    .map((cat, catIdx) => {
      const options = cat.candidates
        .map(
          (c, i) =>
            `    Option ${i}: "${c.title}" — ${c.price} (rating: ${c.rating})`
        )
        .join("\n");
      return `Category ${catIdx}: ${cat.category} (for ${cat.placement})\n  Design need: ${cat.reason}\n  Ideal color/finish: ${cat.colorSuggestion}\n  Amazon options:\n${options}`;
    })
    .join("\n\n");

  const parts: Array<
    { text: string } | { inlineData: { mimeType: string; data: string } }
  > = [{ inlineData: { mimeType: "image/jpeg", data: roomImageBase64 } }];

  // Fetch all product images in parallel (batch fetch)
  const allCandidates = categories.flatMap((cat) => cat.candidates);
  const imageResults = await Promise.allSettled(
    allCandidates.map(async (c) => {
      if (!c.imageUrl) return null;
      const imgRes = await fetch(c.imageUrl);
      if (!imgRes.ok) return null;
      const buffer = await imgRes.arrayBuffer();
      return {
        data: Buffer.from(buffer).toString("base64"),
        mimeType: imgRes.headers.get("content-type") || "image/jpeg",
      };
    })
  );
  for (const result of imageResults) {
    if (result.status === "fulfilled" && result.value) {
      parts.push({
        inlineData: { mimeType: result.value.mimeType, data: result.value.data },
      });
    }
  }

  parts.push({
    text: `You are an expert interior designer. Look at this room photo and the product images from Amazon.

Design Vision: ${designVision}

${candidateDescriptions}

Your job: Pick EXACTLY ONE product from each category that creates the most cohesive, beautiful design together. Consider:
- Color harmony between all selected products AND the existing room
- Style consistency (all products should feel like they belong together)
- Visual appeal and quality based on the product images
- How well each product fits its intended placement in THIS specific room
${budgetInstruction ? `\n${budgetInstruction}\n` : ""}
For each category, return the chosen optionIndex and a short reason. Also write a 2-3 sentence designNarrative describing how the products work together to transform the room.`,
  });

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ role: "user", parts }],
    config: {
      responseMimeType: "application/json",
      responseSchema: curationSchema,
    },
  });

  return response.text ?? "";
}

const detectionSchema = {
  type: Type.OBJECT,
  properties: {
    detections: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          productIndex: { type: Type.INTEGER },
          box_2d: {
            type: Type.ARRAY,
            items: { type: Type.NUMBER },
          },
        },
        required: ["productIndex", "box_2d"],
      },
    },
  },
  required: ["detections"],
};

interface Detection {
  productIndex: number;
  box_2d: number[]; // [ymin, xmin, ymax, xmax] normalized 0-1000
}

export interface DetectableProduct {
  category: string;
  placement: string;
  title: string;
  colorSuggestion: string;
  imageUrl?: string;
}

export type HotspotBox = {
  productIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export async function generateDesignImage(
  roomImageBase64: string,
  selectedProducts: DetectableProduct[],
  eventContext?: string,
  styleHint?: string,
  // Hotspot detection is a second Gemini call that's only useful once a design
  // is unlocked (hotspots aren't rendered behind the paywall). Skip it on the
  // locked create path and compute it lazily at unlock time (P1-b).
  detect: boolean = true
): Promise<{
  generatedImage: string;
  hotspots: HotspotBox[];
}> {
  // Fetch selected product images in parallel
  const productImages = await Promise.allSettled(
    selectedProducts.map(async (p) => {
      if (!p.imageUrl) return null;
      const res = await fetch(p.imageUrl);
      if (!res.ok) return null;
      const buffer = await res.arrayBuffer();
      return {
        data: Buffer.from(buffer).toString("base64"),
        mimeType: res.headers.get("content-type") || "image/jpeg",
      };
    })
  );

  const parts: Array<
    { text: string } | { inlineData: { mimeType: string; data: string } }
  > = [{ inlineData: { mimeType: "image/jpeg", data: roomImageBase64 } }];

  // Add product images and build the product list with image references
  let imageIndex = 2; // image 1 is the room photo
  const productDescriptions: string[] = [];
  for (let i = 0; i < selectedProducts.length; i++) {
    const p = selectedProducts[i];
    const imgResult = productImages[i];
    const hasImage = imgResult.status === "fulfilled" && imgResult.value;

    if (hasImage) {
      parts.push({
        inlineData: {
          mimeType: imgResult.value!.mimeType,
          data: imgResult.value!.data,
        },
      });
      productDescriptions.push(
        `${i + 1}. "${p.title}" — shown in image ${imageIndex}. Place this EXACT product (same color, shape, and style as shown in its image) at: ${p.placement}`
      );
      imageIndex++;
    } else {
      productDescriptions.push(
        `${i + 1}. "${p.title}" (${p.category}, color: ${p.colorSuggestion}) — place it at: ${p.placement}`
      );
    }
  }

  const productList = productDescriptions.join("\n");

  const intro = eventContext
    ? `Image 1 is a photo of a space that will host an event. ${eventContext} The following images are decoration products from Amazon to add to the space.

Decorate this EXACT space for the event. This is a STRICT photo editing task — add festive decorations, do not renovate.`
    : `Image 1 is a room photo. The following images are products from Amazon that need to be added to the room.

Edit the room photo to add these products. This is a STRICT photo editing task.`;

  const addLine = eventContext
    ? `ONLY ADD these decorations (use their EXACT appearance from the product images), placed naturally — balloon arches/clusters on the focal wall, backdrop behind the main area, centerpiece on the table, fairy lights along edges:`
    : `ONLY ADD these products (use their EXACT appearance from the product images):`;

  parts.push({
    text: `${intro}

MUST PRESERVE (do NOT change any of these):
- The exact same walls, wall color, and wall texture
- The exact same floor and flooring material
- The exact same ceiling, ceiling fan, and light fixtures
- ALL existing furniture (sofa, tables, shelves, etc.) — keep them exactly as they are
- The exact same room layout, dimensions, and perspective
- The exact same camera angle
- Whether windows exist or not — do NOT add or remove windows
- All cables, outlets, and existing items

${addLine}
${productList}

Each item must look EXACTLY like its reference image — same color, shape, material, and design. Place them naturally with correct scale, perspective, lighting, and shadows.${
      styleHint
        ? `\n\nSTYLE DIRECTION: Apply a ${styleHint} interior design aesthetic — adjust the overall mood, lighting tone, and arrangement to reflect this style while still adding the exact listed products.`
        : ""
    }${
      eventContext
        ? `

CRITICAL TEXT RULE:
- Do NOT add, render, or reproduce ANY printed words, letters, banners, or signage that name a DIFFERENT occasion than the event described above.
- If a product image contains text such as "Happy Birthday" (or any wording that does not match this event), do NOT copy that text — leave the banner/backdrop blank or show only generic decorative patterns.
- Any visible signage must match the event described above, or contain no readable text at all. Never invent gibberish text.`
        : ""
    }`,
  });

  // Step 1: Generate the redesigned room image
  const imageResponse = await ai.models.generateContent({
    model: "gemini-3.1-flash-image",
    contents: [{ role: "user", parts }],
    config: {
      responseModalities: ["TEXT", "IMAGE"],
    },
  });

  // Extract generated image from response
  let generatedImageBase64 = "";
  const candidates = imageResponse.candidates;
  if (candidates && candidates.length > 0) {
    const responseParts = candidates[0].content?.parts;
    if (responseParts) {
      for (const part of responseParts) {
        if (part.inlineData?.data) {
          generatedImageBase64 = part.inlineData.data;
          break;
        }
      }
    }
  }

  // If image generation failed, fall back to original image
  if (!generatedImageBase64) {
    generatedImageBase64 = roomImageBase64;
  }

  // Step 2 (optional): locate each product. Deferred for locked designs.
  const hotspots = detect
    ? await detectHotspots(generatedImageBase64, selectedProducts)
    : [];

  return { generatedImage: generatedImageBase64, hotspots };
}

/**
 * Locate each product in a generated design via real object detection
 * (box_2d, 0-1000). Split out from generateDesignImage so it can be deferred
 * and run lazily only once a design is entitled to be viewed (P1-b).
 */
export async function detectHotspots(
  generatedImageBase64: string,
  selectedProducts: Pick<DetectableProduct, "category" | "placement" | "title">[]
): Promise<HotspotBox[]> {
  if (selectedProducts.length === 0) return [];

  const detectionList = selectedProducts
    .map(
      (p, i) =>
        `Product index ${i}: "${p.title}" (${p.category}) — expected location: ${p.placement}`
    )
    .join("\n");

  const hotspotResponse = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: "image/png", data: generatedImageBase64 } },
          {
            text: `Detect the 2D bounding box of EACH of these products in this room image. Look at the ACTUAL pixels and find the real object.

${detectionList}

For each product return its box_2d as [ymin, xmin, ymax, xmax], each value normalized to 0-1000 (0 = top/left edge, 1000 = bottom/right edge). The box must tightly enclose the ACTUAL product as it appears in the image — e.g. a nightstand box is on the nightstand, not the bed; a wall-art box is on the art; a plant box is on the plant.

Return one detection per product, using the exact productIndex given above.`,
          },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: detectionSchema,
    },
  });

  const parsed = parseJson<{ detections: Detection[] }>(
    hotspotResponse.text,
    "Hotspot detection"
  );

  // Convert box_2d (0-1000, [ymin,xmin,ymax,xmax]) to percentage center + size
  return selectedProducts.map((_, i) => {
    const det =
      parsed.detections.find((d) => d.productIndex === i) ??
      parsed.detections[i];
    if (det && Array.isArray(det.box_2d) && det.box_2d.length === 4) {
      const [ymin, xmin, ymax, xmax] = det.box_2d;
      return {
        productIndex: i,
        x: (xmin + xmax) / 2 / 10,
        y: (ymin + ymax) / 2 / 10,
        width: Math.abs(xmax - xmin) / 10,
        height: Math.abs(ymax - ymin) / 10,
      };
    }
    // Fallback if detection missing
    return { productIndex: i, x: 50, y: 50, width: 10, height: 10 };
  });
}

// ─── Product recommendations (design vision + product list) ───
// (Previously in lib/claude.ts — it never used Claude; it's Gemini like the
// rest of this module, so it now lives here.)
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
