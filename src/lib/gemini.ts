import { GoogleGenAI, Type } from "@google/genai";
import sharp from "sharp";
import type { RoomAnalysis, RoomGeometry } from "./types";
import type { Locale } from "./locale";

/**
 * How to name the user's Amazon marketplace inside a prompt. Every prompt that
 * asks the model for a search query must go through this — hardcoding "Amazon
 * India" sent US shoppers India-flavoured queries.
 */
function marketplaceName(locale: string | undefined): string {
  return locale === "US" ? "Amazon US" : "Amazon India";
}

// Aspect ratios gemini-3.1-flash-image accepts (SDK ImageConfig).
const SUPPORTED_ASPECTS: ReadonlyArray<readonly [string, number]> = [
  ["1:1", 1], ["2:3", 2 / 3], ["3:2", 3 / 2], ["3:4", 3 / 4],
  ["4:3", 4 / 3], ["9:16", 9 / 16], ["16:9", 16 / 9], ["21:9", 21 / 9],
];

/** Nearest supported ratio, compared in log space so 2:3 vs 3:2 aren't mixed up. */
function nearestAspect(width: number, height: number): string {
  const r = width / height;
  let best = SUPPORTED_ASPECTS[0];
  for (const cand of SUPPORTED_ASPECTS) {
    if (Math.abs(Math.log(cand[1] / r)) < Math.abs(Math.log(best[1] / r))) best = cand;
  }
  return best[0];
}

/**
 * Pin the output to the input photo's shape.
 *
 * Without this the model picks its own aspect ratio, and it drifts hard when
 * reference product images are attached — a 576x1024 room photo with 7 (mostly
 * square) Amazon catalog images came back 1030x1024, a 79% drift. Widening the
 * frame forces the model to invent scene beyond the photo's edges, which is
 * where phantom windows and re-proportioned rooms come from. Measured locally;
 * costs no extra API call.
 */
async function aspectOf(imageBase64: string): Promise<string | undefined> {
  try {
    const meta = await sharp(Buffer.from(imageBase64, "base64")).metadata();
    if (meta.width && meta.height) return nearestAspect(meta.width, meta.height);
  } catch {
    // Unreadable header — fall through and let the model choose, as before.
  }
  return undefined;
}

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

const removableObjectSchema = {
  type: Type.OBJECT,
  properties: {
    id: { type: Type.STRING },
    label: { type: Type.STRING },
    restsOn: { type: Type.STRING },
    effort: { type: Type.STRING },
    blocksFocal: { type: Type.BOOLEAN },
    clearReason: { type: Type.STRING },
  },
  // Deliberately NOT required. The schema is shared with space redesigns, whose
  // prompt says nothing about movability or focal zones — forcing the fields
  // there would make the model invent values, and those values drive what
  // tidy-up pre-ticks. Only the event branch is instructed to fill them.
  required: ["id", "label"],
};

const stagingPlanSchema = {
  type: Type.OBJECT,
  properties: {
    focalZone: { type: Type.STRING },
    focalReason: { type: Type.STRING },
    supportingZones: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["focalZone", "focalReason", "supportingZones"],
};

const roomGeometrySchema = {
  type: Type.OBJECT,
  properties: {
    approxWidthFt: { type: Type.NUMBER },
    approxDepthFt: { type: Type.NUMBER },
    approxCeilingFt: { type: Type.NUMBER },
    scaleReferences: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["approxWidthFt", "approxDepthFt", "approxCeilingFt", "scaleReferences"],
};

const roomAnalysisSchema = {
  type: Type.OBJECT,
  properties: {
    roomType: { type: Type.STRING },
    currentStyle: { type: Type.STRING },
    dimensions: { type: Type.STRING },
    geometry: roomGeometrySchema,
    existingFurniture: { type: Type.ARRAY, items: { type: Type.STRING } },
    lightingCondition: { type: Type.STRING },
    colorPalette: { type: Type.ARRAY, items: { type: Type.STRING } },
    suggestedProducts: { type: Type.ARRAY, items: suggestedProductSchema },
    clutterLevel: { type: Type.STRING },
    removableObjects: { type: Type.ARRAY, items: removableObjectSchema },
    venueKind: { type: Type.STRING },
    stagingPlan: stagingPlanSchema,
  },
  required: [
    "roomType",
    "currentStyle",
    "dimensions",
    "geometry",
    "existingFurniture",
    "lightingCondition",
    "colorPalette",
    "suggestedProducts",
    "clutterLevel",
    "removableObjects",
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
- geometry: estimate the REAL size of the room in feet. Use objects with known typical sizes as rulers — an interior door is ~6.7 ft tall, a 3-seat sofa ~6 ft wide, a light switch ~4 ft above the floor, a bed ~6.3 ft long. Provide:
  - approxWidthFt / approxDepthFt: the visible floor area's width and depth in feet
  - approxCeilingFt: floor-to-ceiling height in feet
  - scaleReferences: 1-3 visible objects you used as rulers, each with its assumed size (e.g. "door on left wall (~6.7 ft tall)", "3-seat sofa (~6 ft wide)")
  Be conservative: if unsure, estimate SMALLER rather than larger.
- existingFurniture: array of items you actually see
- lightingCondition: "bright" | "moderate" | "dim"
- colorPalette: 3 hex colors representing the room
- suggestedProducts: 6-8 products
- clutterLevel: "clean" if the room is empty or nearly so (good blank canvas), "moderate" if it has some furniture/objects, "cluttered" if it is full of furniture and items that would crowd a new design
- removableObjects: ONLY the LARGE, MAIN movable pieces the user might realistically want to remove or replace — substantial furniture and large décor (e.g. sofa, bed, dining/coffee table, chairs, shelving unit, rug, large floor lamp, large potted plant, cabinet/console, TV). Each has a short snake_case "id" and a human "label". EXCLUDE permanent architecture (walls, floor, ceiling, windows, doors, built-in cabinetry) AND all small clutter / tabletop items (remotes, bottles, cups, thermos, food/fruit, books, papers, chargers, cushions, small decor and any loose small object) — those are tidied away automatically and must NOT be listed. If a listed large object rests on another listed object, set "restsOn" to that supporting object's "id" (e.g. a lamp on a side table, a TV on a console) — it must be EXACTLY one of the ids you listed above, copied verbatim, and nothing else; omit it entirely when the object stands on the floor. Return an empty array only if there are no large movable pieces.

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
- geometry: estimate the REAL size of the space in feet. Use objects with known typical sizes as rulers — an interior door is ~6.7 ft tall, a 3-seat sofa ~6 ft wide, a dining table ~2.5 ft tall, a light switch ~4 ft above the floor. Provide:
  - approxWidthFt / approxDepthFt: the visible floor area's width and depth in feet
  - approxCeilingFt: floor-to-ceiling height in feet
  - scaleReferences: 1-3 visible objects you used as rulers, each with its assumed size (e.g. "door on left wall (~6.7 ft tall)", "dining table (~2.5 ft tall)")
  Be conservative: if unsure, estimate SMALLER rather than larger.
- existingFurniture: key furniture/surfaces you see (sofa, table, wall, etc.)
- lightingCondition: "bright" | "moderate" | "dim"
- colorPalette: 3 hex colors representing the space
- venueKind: "indoor" or "outdoor". Decide this FIRST, because it changes the rest of your answer.
  - "indoor": an enclosed room or hall — walls you can decorate, a ceiling, ordinary domestic or hall scale.
  - "outdoor": open-air or open ground — school ground or campus, garden, lawn, park, terrace, rooftop, courtyard, poolside, farmhouse, driveway, street. ALSO use "outdoor" for any space so large and open that it reads as a ground or arena rather than a room, even if technically covered (e.g. a pandal, a shamiana, an open pavilion, a large covered stage area).
  - When genuinely torn, choose "outdoor". Concentrating everything in one spot looks worse in a big open space than spreading out does in a small one.

════ IF venueKind is "indoor", follow THESE rules ════
- stagingPlan: FIRST decide where the decoration goes, before choosing any item.
  - focalZone: the ONE area this design is built around, described so it can be found in the photo (e.g. "the wall behind the television console"). Pick the largest, most visible, least obstructed surface that a guest looking into the room would face. A decoration concentrated in one place reads as designed; the same items spread around a room read as mess.
  - focalReason: one sentence on why that area won.
  - supportingZones: AT MOST 2 further areas that get a light accent. May be empty. Never more than 2.
- suggestedProducts: EVENT DECORATION items, count scaled to the space:
  - 3-4 items if dimensions is "small" OR clutterLevel is "cluttered"
  - 5-6 items if dimensions is "medium" and clutterLevel is "moderate"
  - 6-8 items ONLY if the space is large and clutterLevel is "clean"
  A small or busy room needs fewer, bigger gestures — never more items to compete with what is already there.

════ IF venueKind is "outdoor", follow THESE rules INSTEAD ════
- stagingPlan: OMIT this field entirely. An open ground has no single wall a guest faces, so there is no focal zone to build on and forcing one looks wrong.
- suggestedProducts: 6-8 items. An open venue has room for several separate decorated moments — an entrance or gateway, a stage or backdrop area, seating, pathways, perimeter — so items SHOULD be distributed across the space rather than concentrated in one spot.
- Anchor décor to real structures you can see: existing poles, trees, walls, railings, gates, stage, canopy frame, tables. Never float anything in open ground with nothing supporting it.
- Do not set "effort", "blocksFocal" or "clearReason" on removableObjects — there is no focal zone for them to relate to.
════ END of the venueKind branch ════
- clutterLevel: "clean" if the space is empty or nearly so, "moderate" if it has some furniture/objects, "cluttered" if it is full of items that would crowd the decorations
- removableObjects: everything the occupant could physically shift out of the way before the event — substantial furniture and large décor (sofa, table, chairs, shelving unit, rug, large lamp, large plant, cabinet/console), AND lighter movable things that crowd the space or sit on a wall (bean bag, floor cushions, ride-on toy, laundry basket, drying rack, framed picture, wall hanging, hanging plant, clock, mirror). EXCLUDE only permanent architecture (walls, floor, ceiling, windows, doors, built-ins) and loose tabletop clutter (remotes, bottles, cups, food, papers, chargers), which is tidied away automatically. Each entry has:
  - "id": short snake_case identifier
  - "label": human name
  - "restsOn": the "id" of the object it sits on, if any (e.g. a centerpiece on a table), so clearing never leaves it floating. Copy one of the ids above verbatim, or omit the field — never invent a value.
  - "effort": how hard it is for ONE person to move it before a party —
    - "trivial": lift or unhook in seconds (bean bag, cushions, toys, baskets, framed picture, wall hanging, small plant, clock)
    - "moderate": one person can slide or carry it (armchair, side table, floor lamp, small rug, drying rack)
    - "heavy": needs two people or real effort (sofa, large TV unit, bed, wardrobe, dining table, large rug)
  - "blocksFocal": true if this object sits in, covers, or visually competes with the stagingPlan focalZone. A picture frame or wall hanging in the middle of the chosen backdrop wall is the clearest case — mark it true. Be honest here even for "heavy" objects: if a sofa or TV unit genuinely occupies the focal zone, say so.
  - "clearReason": one short sentence, addressed to the occupant, on what clearing it buys — e.g. "Frees the backdrop wall for the balloon arch." Only needed when effort is "trivial" or blocksFocal is true.

CRITICAL RULES for suggestedProducts:
- Suggest ONLY event DECORATIONS appropriate to the occasion and theme — NOT permanent furniture
- ONLY suggest decorations that fit a surface VISIBLE in THIS photo. Never invent a surface, and never suggest something that needs one the photo does not show:
  - NEVER suggest ceiling-hung décor of ANY kind — no hanging lanterns, swirls, danglers, pom-poms, streamers from the ceiling, or ceiling balloons. Wall, floor and table décor ONLY. This rule is absolute: apply it even if the ceiling or a ceiling fan appears visible.
  - Do NOT suggest a table centerpiece, dessert-table or cake-table decor unless a table is clearly visible. Never invent a table, dessert stand or cake table that is not already in the photo.
  - Do NOT suggest a full-wall backdrop unless a clear, largely unobstructed wall is visible — otherwise suggest a smaller banner sized to the wall space that actually exists
  - Do NOT suggest anything requiring structural changes, new fixtures, or rearranging the room
- INDOOR ONLY — BUILD ONE COMPOSITION, do not sprinkle. At least HALF the items must belong to the stagingPlan focalZone and work together there as a single arrangement (e.g. backdrop + balloons + a sign on the same wall). The remainder go to the supportingZones. Never place items in an area that is neither the focal zone nor a supporting zone.
- INDOOR ONLY — Do NOT stack more than 2 items on any single surface. Three things on one console is clutter, not styling.
- INDOOR ONLY — You MAY assume the objects worth clearing (see removableObjects) are gone; design for the room once the focal zone is clear, not around the mess.
- OUTDOOR ONLY — spread the items across the venue's natural areas (entrance, stage/backdrop, seating, perimeter, pathways). Do NOT concentrate them in one spot, and do NOT reference a focal zone; there isn't one.
- Examples, but only where the matching surface is visible: balloon sets/arches, themed backdrop or banner, fairy/string lights, table centerpiece, garlands, themed props, cake-table decor, welcome sign
- Match the theme and colors specified above
- Each "description" must name which zone the item belongs to (e.g. "balloon arch for the focal wall behind the TV console")
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
      // Bounds the degeneration below. A real analysis is 2-4 KB; the runaway
      // ones reach 150 KB, which is unparseable, slow, and billed.
      maxOutputTokens: 8192,
    },
  });

  return enforceVenueBranch(response.text ?? "");
}

/**
 * `analyzeRoom`, but guaranteed to return parseable JSON or throw.
 *
 * The model intermittently degenerates into a repeating string and never
 * closes it — observed in production as
 * "Unterminated string in JSON at position 154588", and reproduced locally as
 * a `restsOn` value repeating the same id fragment for ~150 KB. Every caller
 * does `JSON.parse` on the result, so a single bad roll became a 500 on the
 * first step of the funnel.
 *
 * Retried rather than repaired: the response is a truncated 150 KB string with
 * no recoverable tail, and the failure is a fresh dice roll each time — the
 * same photo and prompt parse fine on the next attempt. This mirrors the
 * existing retry in generateDesignImage for the model answering with text and
 * no image. Cost is negligible: gemini-2.5-flash text, ~Rs 1-2 a call.
 */
export async function analyzeRoomParsed(
  imageBase64: string,
  eventContext?: string,
  attempts = 3
): Promise<Record<string, unknown>> {
  return parseJsonWithRetry(
    () => analyzeRoom(imageBase64, eventContext),
    attempts,
    "analyzeRoom"
  );
}

/** Split out from analyzeRoomParsed so the retry itself can be tested without
 *  spending a model call — ESM exports can't be stubbed. */
export async function parseJsonWithRetry<T = Record<string, unknown>>(
  produce: () => Promise<string>,
  attempts = 3,
  label = "model"
): Promise<T> {
  let lastErr: unknown;
  for (let i = 1; i <= attempts; i++) {
    const raw = await produce();
    try {
      return JSON.parse(raw) as T;
    } catch (err) {
      lastErr = err;
      console.error(
        `[${label}] unparseable JSON on attempt ${i}/${attempts} (${raw.length} chars):`,
        (err as Error).message
      );
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error(`${label} returned unparseable JSON`);
}

/**
 * Make the indoor/outdoor split a guarantee rather than a request.
 *
 * The prompt tells the model to omit `stagingPlan` for outdoor venues, but a
 * field that exists in the schema tends to get filled in regardless — that is
 * exactly how `blocksFocal` leaked into space analyses and pre-ticked two beds.
 * Stripping it here means every downstream consumer reverts to pre-staging
 * behaviour on its own, because they all key off `stagingPlan` being present:
 * `recommendedClears` returns [], tidy-up pre-ticks nothing, and
 * `recommendProducts` omits the focal-zone block.
 *
 * Parse failures pass through untouched — the caller already handles bad JSON.
 */
function enforceVenueBranch(json: string): string {
  if (!json) return json;
  try {
    const parsed = JSON.parse(json);
    if (parsed?.venueKind !== "outdoor") return json;

    delete parsed.stagingPlan;
    if (Array.isArray(parsed.removableObjects)) {
      for (const o of parsed.removableObjects) {
        delete o.effort;
        delete o.blocksFocal;
        delete o.clearReason;
      }
    }
    return JSON.stringify(parsed);
  } catch {
    return json;
  }
}

/**
 * Empty a cluttered room so the design step has a clean canvas to work on.
 * Strict photo edit: remove the listed movable objects and reconstruct the
 * surfaces behind them, preserving the room's architecture, perspective and
 * lighting. Items in `keepLabels` are explicitly left in place. Falls back to
 * the original image if the model returns no image.
 */
export async function emptyRoom(
  imageBase64: string,
  removeLabels: string[],
  keepLabels: string[] = [],
  // Kept items whose supporting object is being removed — must be re-placed on a
  // real surface/floor so they don't float.
  orphanedLabels: string[] = []
): Promise<string> {
  const removeLine = removeLabels.length
    ? `Remove these objects: ${removeLabels.join(", ")}.`
      // "decor" used to be in this list, which is how a household shrine became
      // fair game. Devotional items are carved out explicitly below; this line
      // is reached by clearAndRedesign, which passes no keepLabels at all.
    : `Remove ALL movable furniture and objects (sofas, tables, chairs, rugs, lamps, clutter).`;
  const keepLine = keepLabels.length
    ? `\nKEEP these items exactly as they are, do NOT remove them: ${keepLabels.join(", ")}.`
    : "";
  const orphanLine = orphanedLabels.length
    ? `\nThese kept items were resting on something you're removing: ${orphanedLabels.join(", ")}. Re-place each of them naturally on the floor or the nearest suitable surface — never leave them floating.`
    : "";

  // The scope line is deliberately first and deliberately negative. An earlier
  // version opened with "produce a clean, EMPTY version of this exact room",
  // and that framing beat every carve-out below it: given an explicit KEEP for
  // "Corner Plant and Buddha Statue", the model still deleted the statue and
  // swapped a framed artwork for a different one. Naming the removal list as
  // the entire scope — and saying plainly that everything else stays — is what
  // stops "empty the room" being read as "delete whatever is left".
  const scopeLine = removeLabels.length
    ? `This is a STRICT photo editing task with a FIXED scope: remove ONLY the objects listed under REMOVE. Everything else in this photo stays exactly as it is — same position, same size, same colours, same markings. If an object is not named in the REMOVE list, you must reproduce it unchanged. Do not "finish the job" by clearing other things.`
    : `This is a STRICT photo editing task — produce a clean, EMPTY version of this exact room.`;

  const prompt = `This is a photo of a room. ${scopeLine}

${removeLine}${keepLine}${orphanLine}

MUST DO:
- Photo-realistically reconstruct the floor, walls, and any surfaces that were hidden behind the removed objects, matching the existing flooring material, wall color, and texture.
- Keep the EXACT same walls, floor, ceiling, windows, doors, built-in fixtures, room layout, dimensions, perspective, camera angle, and lighting.
- Keep every CEILING FAN, light fixture, chandelier, wall or ceiling lamp, switchboard, socket, AC unit and any other fixed or mounted fitting exactly where it is, unchanged. These are part of the room, not furniture — never remove them, and never remove the ceiling fan even when clearing everything else.
- Also clear away ALL small clutter and loose tabletop items (remotes, bottles, cups, thermos, food/fruit, books, papers, chargers, small stray objects) so every surface looks clean and tidy — regardless of the list above.
- If any item you KEEP was resting on or supported by an item you remove, do NOT leave it floating — place it naturally on the floor or the nearest suitable surface. Nothing may hover in mid-air.

MUST NOT:
- NEVER remove, move, cover or alter religious or devotional items — a temple, mandir, shrine, altar, idol, deity image, framed god picture, prayer corner, cross, or anything used for worship. Leave them exactly as they are, in place, with their exact markings and colours. This holds EVEN when told to remove all objects, and even if they read as "decor" or "clutter". If you are unsure whether something is decoration or devotional, KEEP IT.
- NEVER remove a national flag, a framed family photograph or portrait, or anything else that is plainly personal and irreplaceable. Same rule: when unsure, keep it.
- Do NOT add any new furniture, decorations, or objects.
- Do NOT add, extend, close off, or invent any walls — if a side of the room is open or has no visible wall, keep it exactly that open. Do NOT enclose or "complete" the room.
- Do NOT add or remove windows, doors, or change the architecture.
- Do NOT change the camera angle or crop.

The result must look like a real photograph of the same empty room.`;

  // Pin the output shape to the input, exactly as generateDesignImage and
  // editDesignImage do. This was missing: the cleared canvas is what feeds
  // generateDesignImage, which then pins to the DRIFTED shape, so an unpinned
  // reframe here silently propagates into the final render and leaves it a
  // different shape from original_image_url — which is what before/after and
  // the reveal video compare against.
  const aspectRatio = await aspectOf(imageBase64);

  const response = await ai.models.generateContent({
    model: "gemini-3.1-flash-image",
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: "image/jpeg", data: imageBase64 } },
          { text: prompt },
        ],
      },
    ],
    config: {
      responseModalities: ["TEXT", "IMAGE"],
      ...(aspectRatio ? { imageConfig: { aspectRatio } } : {}),
    },
  });

  const candidates = response.candidates;
  if (candidates && candidates.length > 0) {
    const responseParts = candidates[0].content?.parts;
    if (responseParts) {
      for (const part of responseParts) {
        if (part.inlineData?.data) {
          return part.inlineData.data;
        }
      }
    }
  }

  // No image returned — fall back to the original so the flow can continue.
  return imageBase64;
}

/**
 * Admin-only touch-up of an ALREADY GENERATED design.
 *
 * Unlike `regenerateDesign`, this never re-runs recommend/search/curate — it
 * takes the finished render and applies one free-text instruction to it. The
 * product list is therefore untouched, which is what lets the caller carry the
 * existing hotspots across verbatim instead of re-detecting them.
 *
 * Two deliberate departures from `emptyRoom`, which is otherwise the same
 * shape:
 *  - Aspect is pinned to the input. Hotspots are stored as percentages, so they
 *    survive a resolution change but NOT a reframe; letting the model pick its
 *    own ratio would silently slide every pin off its product.
 *  - Failure throws instead of returning the input. Silently handing back an
 *    unedited image would look to the admin like the prompt did nothing.
 */
export async function editDesignImage(
  imageBase64: string,
  instruction: string
): Promise<string> {
  const prompt = `This is a finished interior/event design render. This is a STRICT photo editing task: apply ONLY the change requested below and leave everything else pixel-identical.

REQUESTED CHANGE:
${instruction}

MUST PRESERVE EXACTLY:
- The same framing, camera angle, perspective, and aspect ratio — do NOT crop, zoom, reframe, or letterbox.
- The same walls, floor, ceiling, windows, doors, and lighting.
- Every existing object and decoration that the requested change does not explicitly mention — same position, same size, same colour, same materials. Do not restyle, tidy, upgrade, or "improve" anything you were not asked to touch.
- Overall colour grade and exposure.

MUST NOT:
- Do NOT add any object that was not asked for.
- Do NOT move or resize existing items to make room for the change.
- Do NOT invent readable text. If the change involves signage, render only what was asked for.

The result must look like the same photograph with just the requested edit applied.`;

  const aspectRatio = await aspectOf(imageBase64);

  const response = await ai.models.generateContent({
    model: "gemini-3.1-flash-image",
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: "image/png", data: imageBase64 } },
          { text: prompt },
        ],
      },
    ],
    config: {
      responseModalities: ["TEXT", "IMAGE"],
      ...(aspectRatio ? { imageConfig: { aspectRatio } } : {}),
    },
  });

  const candidate = response.candidates?.[0];
  for (const part of candidate?.content?.parts ?? []) {
    if (part.inlineData?.data) return part.inlineData.data;
  }

  // Surface why, the way generateDesignImage does — a refusal or a safety block
  // is actionable for the admin, "nothing happened" is not.
  const reason = candidate?.finishReason ?? "unknown";
  const text = (candidate?.content?.parts ?? [])
    .map((p) => ("text" in p ? p.text : ""))
    .filter(Boolean)
    .join(" ")
    .slice(0, 300);
  throw new Error(
    `Edit produced no image (finishReason: ${reason})${text ? `: ${text}` : ""}`
  );
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
  /** Absent on designs sourced before per-category status tracking existed. */
  status?: "ok" | "no_results" | "upstream_error";
  searchQuery?: string;
  searchUrl?: string;
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
  // Only categories that actually have options are worth asking the model about.
  // Rendering "Amazon options:" followed by an empty list asked it to choose from
  // nothing, and it obliged by inventing a reason ("No Amazon options were
  // provided for this category.") that surfaced to users as product copy.
  const shoppable = categories
    .map((cat, originalIndex) => ({ cat, originalIndex }))
    .filter(({ cat }) => cat.candidates.length > 0);

  if (!shoppable.length) {
    // Every category came back empty — skip the vision call entirely rather
    // than spend it on a request that is already fully degraded.
    return JSON.stringify({ selections: [], designNarrative: "" });
  }

  const candidateDescriptions = shoppable
    .map(({ cat }, catIdx) => {
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
  const allCandidates = shoppable.flatMap(({ cat }) => cat.candidates);
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

  // The model numbered categories over the shoppable subset; translate those
  // back to indices into the caller's full `categories` array.
  const raw = response.text ?? "";
  if (!raw) return raw;
  try {
    const parsed = JSON.parse(raw) as {
      selections?: { categoryIndex: number; optionIndex: number; reason: string }[];
      designNarrative?: string;
    };
    const selections = (parsed.selections || [])
      .filter((sel) => shoppable[sel.categoryIndex] !== undefined)
      .map((sel) => ({
        ...sel,
        categoryIndex: shoppable[sel.categoryIndex].originalIndex,
      }));
    return JSON.stringify({ ...parsed, selections });
  } catch {
    // Malformed JSON is the caller's problem to report, as before.
    return raw;
  }
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
  detect: boolean = true,
  // Estimated room geometry from analyzeRoom — grounds product scale so a
  // small room doesn't get an oversized rug/backdrop. Optional: absent on
  // restyles of pre-geometry designs.
  geometry?: RoomGeometry,
  // Space redesigns only: when true the AI may reposition existing/kept furniture
  // for the best layout (identity/appearance preserved). Off for events (decorate,
  // don't rearrange the venue) and for the "keep my layout" opt-out.
  optimizeLayout: boolean = false,
  // True when the room image passed in has already been through emptyRoom, so
  // the prompt must stop describing furniture as present. See furnitureBlock
  // and the scaleReferences note.
  canvasCleared: boolean = false
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

  // Events only. The model reads "floor" as any open surface and treats the
  // centre rug and walkways as empty space to fill, which strands cutouts and
  // props exactly where guests need to stand. Deliberately NOT applied to room
  // redesigns — there, floor items (rugs, floor lamps) are the entire point.
  const floorClearance = eventContext
    ? `

FLOOR CLEARANCE & WALKWAY RULE (applies to the products you ADD, never to what is already in the photo): Keep all central room floors, rugs, and walking paths completely clear. Standalone decorative items, cutouts, or props that YOU ADD must be tightly clustered against perimeter walls, corners, or furniture bases. Never scatter added items loose across open floor areas or pathways where people would walk. Décor already standing in the photo — a flagpole, a floor lamp, a plant, a shrine — stays exactly where it is; do NOT relocate or remove it to satisfy this rule.`
    : "";

  const scaleBlock = geometry
    ? `

SCALE CONSTRAINTS (critical — respect the room's REAL size):
- This space is approximately ${Math.round(geometry.approxWidthFt)} ft wide × ${Math.round(geometry.approxDepthFt)} ft deep with a ~${Math.round(geometry.approxCeilingFt)} ft ceiling.${
        geometry.scaleReferences?.length
          ? canvasCleared
            ? // Same trap as the focal zone: the rulers were picked from the
              // FURNISHED photo ("3-seat sofa (~6 ft wide)") and the room has
              // since been cleared, so they are not in the image being edited.
              // Left unqualified, the model can paint the ruler back in to
              // have something to measure against.
              `\n- These objects were used to measure the room BEFORE it was cleared: ${geometry.scaleReferences.join("; ")}. They are no longer in the photo — do NOT expect to see them and do NOT add them back. Use the foot dimensions above as the real constraint.`
            : `\n- Use these visible objects as size rulers: ${geometry.scaleReferences.join("; ")}.`
          : ""
      }
- Render EVERY added product at its true real-world size relative to those references. If a product title states a size (e.g. "5x7 ft rug", "6x4 ft backdrop"), treat that size as a hard constraint.
- Never let an added item exceed the wall, floor, or ceiling space that physically exists for it — a rug must fit the visible floor with margin, a backdrop must not span wider than its wall, hanging decor must hang below the ceiling, furniture must not dwarf the existing furniture next to it.
- When unsure, render items slightly SMALLER than plausible rather than larger.`
    : "";

  // Space redesigns may rearrange kept furniture for a better layout; events keep
  // the venue as-is. Architecture is always fixed either way.
  const canRearrange = optimizeLayout && !eventContext;
  const furnitureBlock = canvasCleared
    ? // The photo handed to us has already been emptied. Telling the model to
      // "keep ALL existing furniture exactly where it is" would be an
      // instruction to preserve objects that are not in the image, which
      // invites it to paint them back in to comply.
      `EXISTING FURNITURE:
- This room has ALREADY been cleared. There is no existing furniture in the photo to keep, and you must NOT invent or add any back — no sofa, bed, table, cabinet or shelving unless it is one of the products listed below.
- Everything still visible — architecture, ceiling fans, light fixtures, built-ins, and any remaining décor — stays exactly as it is.`
    : canRearrange
    ? `EXISTING FURNITURE (you MAY rearrange for the best layout):
- You may REPOSITION the existing furniture to create the best, most cohesive layout (e.g. move a lamp beside the sofa, angle a chair toward the focal point, pull the rug under the seating).
- Keep each existing item's IDENTITY and APPEARANCE IDENTICAL — same sofa, same lamp, same colors and materials — only place it better. Do NOT invent, remove, or restyle existing furniture.
- Respect real-world placement: large pieces sit against or near walls, nothing floats, and everything stays at correct scale.`
    : `EXISTING FURNITURE (keep in place):
- ALL existing furniture (sofa, tables, shelves, etc.) — keep them exactly where they are.
- All cables, outlets, and existing items stay as-is.`;

  parts.push({
    text: `${intro}${scaleBlock}

MUST PRESERVE EXACTLY (never change the architecture):
- The exact same walls, wall color, and wall texture. Do NOT add, extend, close off, or invent any walls — if a side of the room is open, half-walls, or has no visible wall in the photo, keep it exactly that open (do NOT enclose the space or "complete" the room).
- The exact same floor and flooring material
- The exact same ceiling, ceiling fan, and light fixtures
- The exact same room dimensions, boundaries, perspective, and camera angle — do NOT crop, zoom, or reframe
- Whether windows and doors exist or not — do NOT add or remove them
- EXISTING DÉCOR ALREADY IN THE PHOTO — flags and flagpoles, religious or devotional items, artwork, framed photos, wall hangings, mirrors, trophies, plants, and any other ornament the occupant has put there. Reproduce each one in place, unchanged, including its exact markings and colours. These belong to the occupant: they are NOT clutter, they are NOT props to be relocated, and an added product must never replace or obscure one.

${furnitureBlock}
- Tidy the space as part of the redesign: clear away any small clutter and loose tabletop items (remotes, bottles, cups, food/fruit, papers, chargers, small stray objects) so surfaces look clean and styled. This applies ONLY to disposable everyday objects — never to the main furniture above, and never to anything covered by MUST PRESERVE.
- Nothing may hover in mid-air — if an item's previous support was removed, place it on a real surface or the floor.

${addLine}
${productList}${floorClearance}

Each item must look EXACTLY like its reference image — same color, shape, material, and design. Place them naturally with correct scale, perspective, lighting, and shadows.${
      styleHint
        ? `\n\nSTYLE DIRECTION: Apply a ${styleHint} interior design aesthetic — adjust the overall mood, lighting tone, and arrangement to reflect this style while still adding the exact listed products.`
        : ""
    }${
      eventContext
        ? `

CRITICAL TEXT RULE (about the products you ADD — it never overrides MUST PRESERVE):
- Do NOT add, render, or reproduce ANY printed words, letters, banners, or signage that name a DIFFERENT occasion than the event described above.
- This rule does NOT apply to markings already present in the room photo. A flag, emblem, artwork or sign that is already there is preserved exactly as-is, whatever it depicts.
- If a product image contains text such as "Happy Birthday" (or any wording that does not match this event), do NOT copy that text — leave the banner/backdrop blank or show only generic decorative patterns.
- Any visible signage must match the event described above, or contain no readable text at all. Never invent gibberish text.`
        : ""
    }`,
  });

  // Step 1: Generate the redesigned room image.
  //
  // The model intermittently answers with TEXT only and no image part — a
  // refusal, a safety block, or it "explaining" instead of rendering. The text
  // part used to be discarded, so the admin alert couldn't say which. Capture
  // finishReason + the text so the next failure is diagnosable.
  const aspectRatio = await aspectOf(roomImageBase64);

  async function renderOnce(): Promise<{
    image: string;
    finishReason: string;
    text: string;
  }> {
    const res = await ai.models.generateContent({
      model: "gemini-3.1-flash-image",
      contents: [{ role: "user", parts }],
      config: {
        responseModalities: ["TEXT", "IMAGE"],
        ...(aspectRatio ? { imageConfig: { aspectRatio } } : {}),
      },
    });
    const candidate = res.candidates?.[0];
    const responseParts = candidate?.content?.parts ?? [];
    let image = "";
    const texts: string[] = [];
    for (const part of responseParts) {
      if (!image && part.inlineData?.data) image = part.inlineData.data;
      if (part.text) texts.push(part.text);
    }
    return {
      image,
      finishReason: String(candidate?.finishReason ?? "unknown"),
      text: texts.join(" ").trim(),
    };
  }

  let attempt = await renderOnce();
  // One automatic retry. The failure is usually transient, and otherwise the
  // user has to notice the error and press "Try again" themselves — on a paid
  // step, after waiting through the whole pipeline.
  if (!attempt.image) {
    console.warn(
      `[generateDesignImage] no image (finishReason=${attempt.finishReason}) — retrying once. Model said: ${attempt.text.slice(0, 300)}`
    );
    attempt = await renderOnce();
  }

  const generatedImageBase64 = attempt.image;

  // Still nothing: do NOT silently save the untouched original — that ships a
  // "design" that did nothing to the photo (and wastes the user's unlock).
  // Throw so the pipeline surfaces an error + offers a retry. The route shows
  // the user a generic message and emails admins this one, so the diagnostics
  // go here.
  if (!generatedImageBase64) {
    throw new Error(
      `The design couldn't be rendered this time. Please try again. [finishReason=${attempt.finishReason}; model said: ${attempt.text.slice(0, 400) || "(nothing)"}]`
    );
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

// ─── Personal Makeover ───

const personAnalysisSchema = {
  type: Type.OBJECT,
  properties: {
    bodyType: { type: Type.STRING },
    skinTone: { type: Type.STRING },
    currentStyle: { type: Type.STRING },
    colorPalette: { type: Type.ARRAY, items: { type: Type.STRING } },
    hairDescription: { type: Type.STRING },
    suggestedItems: { type: Type.ARRAY, items: suggestedProductSchema },
  },
  required: ["bodyType", "skinTone", "currentStyle", "colorPalette", "hairDescription", "suggestedItems"],
};

const outfitRecommendationSchema = {
  type: Type.OBJECT,
  properties: {
    outfitVision: { type: Type.STRING },
    items: {
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
        required: ["category", "searchQuery", "placement", "reason", "colorSuggestion"],
      },
    },
  },
  required: ["outfitVision", "items"],
};

export async function analyzePerson(
  imageBase64: string,
  styleContext: string
): Promise<string> {
  const prompt = `You are an expert personal stylist and fashion designer — think Manish Malhotra, the trusted advisor who studies a client before designing their look.

Analyze this photo carefully. The person wants a "${styleContext}" makeover.

Assess:
- bodyType: body shape and proportions (e.g. "athletic build with broad shoulders", "petite hourglass", "tall and lean")
- skinTone: precise undertone (e.g. "warm olive with golden undertones", "deep cool brown", "fair neutral")
- currentStyle: what their current outfit says about their personal taste
- colorPalette: exactly 3 hex color codes that are most flattering for their skin undertone and coloring
- hairDescription: hair color, length, and texture as context for accessories
- suggestedItems: 4-6 clothing slots appropriate for a ${styleContext} look for this person. Each must have:
  - id: short snake_case (e.g. "blazer", "trousers", "heels")
  - label: human-readable (e.g. "Structured Blazer")
  - description: why this specific silhouette or piece flatters THIS person's body type and coloring
  - icon: single emoji

Be direct, expert, and specific. Reference what you actually see in the photo.`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: "image/jpeg", data: imageBase64 } },
          { text: prompt },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: personAnalysisSchema,
    },
  });

  return response.text ?? "";
}

export async function recommendOutfit(
  personAnalysis: {
    bodyType: string;
    skinTone: string;
    colorPalette: string[];
    hairDescription: string;
  },
  styleType: string,
  styleContext: string,
  selectedItems: string[],
  gender?: string
): Promise<string> {
  const genderHint = gender ? `Gender/preference: ${gender}.` : "";
  const itemsList = selectedItems.length > 0
    ? `The user specifically wants these items: ${selectedItems.join(", ")}.`
    : "";

  const prompt = `You are an expert personal stylist — think Manish Malhotra advising a client for their perfect ${styleType} look.

Person profile:
- Body type: ${personAnalysis.bodyType}
- Skin tone: ${personAnalysis.skinTone}
- Flattering color palette: ${personAnalysis.colorPalette.join(", ")}
- Hair: ${personAnalysis.hairDescription}
${genderHint}

Style goal: ${styleContext}
${itemsList}

Create ONE cohesive, complete outfit that this person wears ALL AT ONCE. For each item provide:
- category: specific clothing item (e.g. "wrap dress", "slim blazer", "strappy heels")
- searchQuery: Amazon search query, 3-5 words (e.g. "women camel wrap dress", "slim fit navy blazer"). Include the gender and color.
- placement: body zone for the virtual try-on image (e.g. "upper body / torso", "lower body / legs", "feet", "over right shoulder as a bag", "neck and ears as jewellery")
- reason: WHY this silhouette/color flatters THIS person's specific body type and skin tone (1 sentence)
- colorSuggestion: exact color (e.g. "camel tan", "emerald green", "ivory white")

CRITICAL RULES — the outfit must be physically wearable as a single look:
- Return EXACTLY ONE item per body zone. NEVER include two tops, two bottoms, or two pairs of footwear — a person cannot wear both a shirt and a polo, or both pants and shorts.
- A one-piece (dress/jumpsuit) counts as BOTH top and bottom — do not add a separate top or bottom with it.
- Include at most 5 items total: one top, one bottom (or a one-piece), one footwear, and optionally 1-2 accessories (bag, sunglasses, jewellery, hat, or scarf).
- Every single item you return WILL be placed on the person in the generated photo, so only include items that can genuinely be worn together at the same time.

Also write a 2-3 sentence outfitVision in a stylist's voice — explain the complete look and why it was chosen for this person specifically. Sound like a fashion expert, not a product description.

Ensure all items work together as a cohesive look. Choose colors from or complementary to the person's flattering palette.`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      responseMimeType: "application/json",
      responseSchema: outfitRecommendationSchema,
    },
  });

  return response.text ?? "";
}

const makeoverExtrasSchema = {
  type: Type.OBJECT,
  properties: {
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          category: { type: Type.STRING },
          query: { type: Type.STRING },
        },
        required: ["category", "query"],
      },
    },
  },
  required: ["items"],
};

/**
 * Stylist-picked complementary ACCESSORIES for the makeover "Complete the look"
 * grid. Returns 4-6 gender-appropriate Amazon search queries tailored to the
 * style — mirrors how recommendProducts writes queries for the main pipeline.
 */
export async function recommendMakeoverExtras(
  styleLabel: string,
  gender: string | undefined,
  locale: string
): Promise<{ items: { category: string; query: string }[] }> {
  const genderWord =
    gender === "Women" ? "women's" : gender === "Men" ? "men's" : "unisex";
  const marketplace = marketplaceName(locale);

  const prompt = `You are an expert personal stylist finishing a "${styleLabel}" look for a ${genderWord} outfit.

The person already has their main garments (top, bottom, footwear). Suggest 4-6 COMPLEMENTARY ACCESSORIES that complete this look — choose from: bag, watch, sunglasses, jewellery, hat/cap, fragrance, belt, scarf, or a small style-specific extra. Do NOT suggest tops, bottoms, dresses, or footwear (already covered).

For each item provide:
- category: a short label (e.g. "Watch", "Bag", "Sunglasses")
- query: a 3-5 word ${marketplace} search query that MUST include the gender word "${genderWord === "unisex" ? "unisex" : genderWord.replace("'s", "")}" and be specific enough to return relevant results (e.g. "men brown leather watch", "women straw beach hat").

Keep every item gender-appropriate for a ${genderWord} look (do not suggest earrings or a clutch for a men's look unless unisex). Keep them cohesive with the ${styleLabel} style.`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      responseMimeType: "application/json",
      responseSchema: makeoverExtrasSchema,
    },
  });

  return parseJson<{ items: { category: string; query: string }[] }>(
    response.text,
    "Makeover extras"
  );
}

export async function generateMakeoverImage(
  personImageBase64: string,
  selectedProducts: DetectableProduct[],
  styleHint: string,
  sceneHint?: string,
  detect: boolean = true
): Promise<{ generatedImage: string; hotspots: HotspotBox[] }> {
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
  > = [{ inlineData: { mimeType: "image/jpeg", data: personImageBase64 } }];

  let imageIndex = 2;
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
        `${i + 1}. "${p.title}" — shown in image ${imageIndex}. Dress the person in this EXACT product (same color, pattern, and style as shown) at: ${p.placement}`
      );
      imageIndex++;
    } else {
      productDescriptions.push(
        `${i + 1}. "${p.title}" (${p.category}, color: ${p.colorSuggestion}) — place at: ${p.placement}`
      );
    }
  }

  const productList = productDescriptions.join("\n");

  parts.push({
    text: `Image 1 is a photo of a person. The following images are clothing/accessory products from Amazon. Dress this person in the outfit.

MUST PRESERVE (do NOT change any of these):
- The person's face, facial features, and expression
- The person's skin tone and complexion
- The person's hair (color, length, and style)
- The person's body shape, pose, and proportions

MUST CHANGE:
- Replace/add clothing using the EXACT products shown in the reference images
- Each clothing item must look exactly like its reference image — same color, pattern, material, and design${
      sceneHint
        ? `
- Replace the background/setting with ${sceneHint}. The person must be naturally composited into this new scene with matching lighting, shadows, and perspective — as if the photo was really taken there.`
        : ""
    }

CLOTHING INSTRUCTIONS:
${productList}

For accessories (bags, jewellery, sunglasses): add in a natural position without obscuring the face.

STRICT — do NOT invent any items:
- Dress the person ONLY in the products listed above. Do NOT add any extra garment, layer, or accessory that is not in the list — no belts, watches, ties, scarves, hats, jackets, or jewellery unless it is one of the provided products.
- Every clothing item on the person must correspond to a provided product. Nothing shoppable should appear that isn't in the list.

The result must look like a real photo of the same person in a new outfit${sceneHint ? " and setting" : ""}. Maintain photorealism with correct scale, perspective, lighting, and fabric drape.

STYLE DIRECTION: ${styleHint} aesthetic.`,
  });

  const imageResponse = await ai.models.generateContent({
    model: "gemini-3.1-flash-image",
    contents: [{ role: "user", parts }],
    config: { responseModalities: ["TEXT", "IMAGE"] },
  });

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

  if (!generatedImageBase64) {
    generatedImageBase64 = personImageBase64;
  }

  const hotspots = detect
    ? await detectHotspots(generatedImageBase64, selectedProducts)
    : [];

  return { generatedImage: generatedImageBase64, hotspots };
}

// ─── Product recommendations (design vision + product list) ───
// (Previously in lib/claude.ts — it never used Claude; it's Gemini like the
// rest of this module, so it now lives here.)
/**
 * Enforce the fit scores the model gave its own recommendations.
 *
 * A decoration that cannot physically fit is worse than a missing one: the
 * renderer is told to add every product it is handed, so an oversized backdrop
 * in a narrow room gets rendered by widening the room — the same mechanism that
 * bricked up a sliding door to gain wall.
 *
 * Deliberately conservative:
 *  - Items with no score are KEPT (absent on anything recommended before this
 *    field existed, and on a model that simply declined to answer).
 *  - Never returns an empty set. If everything scores low the room is the
 *    problem, not the list, so the best-scoring items survive and the design is
 *    sparse rather than blank.
 */
function enforceFit(json: string, minScore = 3, floor = 3): string {
  if (!json) return json;
  try {
    const parsed = JSON.parse(json);
    const products = parsed?.products;
    if (!Array.isArray(products) || !products.length) return json;

    const scored = (p: { fitScore?: number }) =>
      typeof p?.fitScore === "number" ? p.fitScore : null;
    const kept = products.filter((p) => (scored(p) ?? minScore) >= minScore);

    if (kept.length >= Math.min(floor, products.length)) {
      parsed.products = kept;
    } else {
      // Everything (or nearly everything) failed — keep the least-bad few.
      parsed.products = [...products]
        .sort((a, b) => (scored(b) ?? 0) - (scored(a) ?? 0))
        .slice(0, Math.min(floor, products.length));
    }
    return JSON.stringify(parsed);
  } catch {
    return json;
  }
}

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
          // How well this item physically fits the room, 1-5. OPTIONAL, and
          // absent on everything recommended before this existed — enforceFit
          // treats a missing score as "no opinion" and keeps the item, so old
          // behaviour is unchanged.
          fitScore: { type: Type.NUMBER },
          fitReason: { type: Type.STRING },
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
  eventContext?: string,
  // Items the user chose to remove in the tidy-up step. They are gone from the
  // canvas, so recommendations must treat them as absent (and may fill the
  // freed space).
  removeLabels: string[] = [],
  // Which Amazon marketplace the search queries are written for. Defaults to IN
  // to match `searchProducts`, but every caller should pass the real locale —
  // the query wording, not just the marketplace routing, has to match.
  locale: Locale = "IN",
  // True when `removeLabels` came from the always-empty flag rather than from
  // the user picking items in tidy-up. Keeps space recommendations additive —
  // see removedBlock.
  autoCleared = false
): Promise<string> {
  const marketplace = marketplaceName(locale);
  const productTypesList =
    selectedProductTypes.length > 0
      ? `\nThe user has specifically requested these item types: ${selectedProductTypes.join(", ")}. You MUST include one product for each of these types. You may suggest additional complementary items if needed.`
      : "";

  // Existing furniture minus anything the user removed, so we don't design
  // around items that are no longer in the room.
  const remaining = roomAnalysis.existingFurniture.filter(
    (f) => !removeLabels.some((r) => f.toLowerCase().includes(r.toLowerCase()) || r.toLowerCase().includes(f.toLowerCase()))
  );
  // `analysisBlock` is shared by spacePrompt and eventPrompt, so the space
  // wording ("suggest replacements/fillers for the freed space") reached event
  // designs too — and there it is exactly backwards. Someone clearing the TV
  // wall to make room for a Ganesh mandap was offered a Rs 37,999 television
  // and a new TV console to replace the ones they had just removed. In an
  // event the cleared space IS the point; it gets decorated, not refurnished.
  //
  // The space wording is also wrong when WE cleared the room rather than the
  // user asking for it (the always_empty_space flag). "Suggest replacements
  // for the freed space" is right after someone deliberately removes their
  // sofa; applied to an automatic clear it turns every room redesign into a
  // furniture shopping list — sofa, bed, dining table — which blows past the
  // budget slider's ceiling and is the same path that produced the Rs 37,999
  // television. `autoCleared` selects an additive third branch instead.
  const removedBlock = removeLabels.length
    ? eventContext
      ? `\n- REMOVED by the user for the event (already carried out of the room — do not design around these, and do NOT replace them): ${removeLabels.join(", ")}. The space they freed up is for DECORATIONS. Never suggest a replacement for a removed item, and never suggest furniture, electronics or appliances (TVs, consoles, cabinets, shelving, clocks) — the occupant is decorating for one day, not refurnishing.`
      : autoCleared
      ? `\n- CLEARED for rendering (these were taken out of the photo automatically so the design could be shown on a clean room — the occupant did NOT ask to get rid of them and still owns them): ${removeLabels.join(", ")}. Do NOT design around them, and do NOT suggest replacements for them. Recommend ADDITIVE pieces only — rugs, wall art, lamps, cushions, plants, shelves, side tables and similar. Never suggest large furniture the occupant already owns (sofa, bed, dining table, wardrobe, TV or media unit).`
      : `\n- REMOVED by the user (no longer in the room — do not design around these; suggest replacements/fillers for the freed space where it makes sense): ${removeLabels.join(", ")}`
    : "";

  // The staging plan is decided once, in analyzeRoom, from the photo. Echoing
  // it here is what stops each product getting a placement in isolation — the
  // failure mode that scattered one birthday across four walls and a console.
  // Event-only. `analysisBlock` is shared with spacePrompt, which has no
  // instructions for honouring a focal zone — injecting one there would just be
  // noise in the prompt.
  // Indoor events only. `analyzeRoom` strips the staging plan for outdoor
  // venues, so its absence is the signal to fall back to the pre-staging
  // stylist rules — concentrating everything in one spot looked wrong on open
  // grounds like a school campus.
  const plan = eventContext ? roomAnalysis.stagingPlan : undefined;

  const stylistRules = plan?.focalZone
    ? `Think like a professional party stylist:
1. Define a clear decoration direction matching the occasion, theme, and colors
2. Build ONE arrangement in the FOCAL ZONE named above — the biggest, most photographed moment of the party lives there. At least HALF the items must be placed in that zone and must read as a single composition, not as separate objects that happen to share a wall.
3. Anything left over goes to a SUPPORTING ZONE. If none are listed, keep everything in the focal zone.
4. Never place an item in an area that is neither the focal zone nor a supporting zone, however tempting the empty surface looks. Scattering one item per wall is what makes a room look messy rather than decorated.
5. Never assign more than 2 items to the same surface or piece of furniture.`
    : `Think like a professional party stylist:
1. Define a clear decoration direction matching the occasion, theme, and colors
2. Pick decorations that work TOGETHER as a cohesive festive set
3. Tie each item to a zone in the space. This is an open or outdoor venue, so spread the items across its natural areas — entrance or gateway, stage or backdrop, seating, perimeter, pathways — rather than concentrating them in one spot.
4. Anchor every item to a real structure visible in the photo (pole, tree, wall, railing, gate, stage, canopy frame, table). Nothing should stand in open ground with no support.`;

  const placementRule = plan?.focalZone
    ? "MUST start by naming the zone this belongs to, then the precise spot within it, e.g. 'focal zone — centred on the wall behind the TV console, at eye level'"
    : "which zone in the space, e.g. 'on the wall behind the main table'";

  // The focal zone is chosen by analyzeRoom from the FURNISHED photo and is
  // described by pointing at furniture ("the wall behind the television
  // console"). The room is then cleared before rendering, so that landmark is
  // gone from the pixels the decorator model actually sees. Re-analysing the
  // cleared canvas would produce a second focal zone that can contradict the
  // one already shown on the tidy-up screen, so instead: tell it the name is a
  // location, not an object.
  const clearedZoneNote =
    plan?.focalZone && removeLabels.length
      ? `\n- NOTE: the focal zone is named after furniture that has since been carried out of the room (${removeLabels.join(", ")}). Read it as a LOCATION — that wall, that corner, that side of the room — not as the objects it mentions. Do not expect to see them, and never ask for an item to be placed on one.`
      : "";
  const stagingBlock = plan?.focalZone
    ? `\n- FOCAL ZONE (the design is built here): ${plan.focalZone}${
        plan.focalReason ? ` — ${plan.focalReason}` : ""
      }${
        plan.supportingZones?.length
          ? `\n- SUPPORTING ZONES (light accents only): ${plan.supportingZones.join("; ")}`
          : "\n- SUPPORTING ZONES: none — keep everything in the focal zone."
      }${clearedZoneNote}`
    : "";

  const analysisBlock = `Space Analysis:
- Type: ${roomAnalysis.roomType}
- Current Style: ${roomAnalysis.currentStyle}
- Size: ${roomAnalysis.dimensions}
- Existing Furniture/Surfaces: ${remaining.join(", ") || "cleared / mostly empty"}
- Lighting: ${roomAnalysis.lightingCondition}
- Current Colors: ${roomAnalysis.colorPalette.join(", ")}${stagingBlock}${removedBlock}
${productTypesList}`;

  const spacePrompt = `You are an expert interior designer. Based on the space analysis and user preferences below, create a design vision and recommend specific products that would transform this space.

${analysisBlock}

Think like a professional designer:
1. First define a clear design direction (color scheme, style, mood)
2. Then pick products that work TOGETHER as a cohesive set
3. Each product should complement the others AND the existing room

For each product provide:
- category: specific product type, e.g. 'geometric patterned area rug'
- searchQuery: SHORT ${marketplace} search query (3-5 words max, e.g. 'geometric rug grey yellow'). Keep it generic enough to find results.
- placement: where in the room, e.g. 'center of the room in front of the sofa'
- reason: why this product improves the space and how it connects to the others
- colorSuggestion: specific color/finish, e.g. 'grey with mustard yellow accents'

Also write a clear 2-3 sentence designVision describing the overall color palette, style theme, and mood.`;

  const eventPrompt = `You are an expert event decorator. ${eventContext}

Based on the space analysis and the requested items below, create a decoration vision and recommend specific DECORATION products to style this space for the event.

${analysisBlock}

${stylistRules}

For each product provide:
- category: specific decoration type for THIS occasion (e.g. for an Annaprasan: 'annaprasan traditional backdrop')
- searchQuery: SHORT ${marketplace} search query (3-5 words max) that MUST include the occasion named above. For example, an Annaprasan query should read like 'annaprasan decoration backdrop' or 'annaprasan balloon kit' — NOT 'birthday' anything. CRITICAL: never put a DIFFERENT occasion's name in the query (do not write "birthday" unless the event itself is a birthday). Include the theme/colors where helpful, but keep it generic enough to return results.
- placement: ${placementRule}
- reason: how this decoration supports the theme and connects to the others
- colorSuggestion: specific colors/finish matching the theme
- fitScore: 1-5, how well this physically fits THIS room. Be honest and use the real dimensions above, not the ideal version of this decoration:
  - 5 = there is clearly room for it at full size
  - 3 = it fits only in a reduced form (a 4 ft banner where a full backdrop was wanted, a half arch instead of a full one)
  - 1 = it does not fit and would have to overlap a window, a door, a walkway or another item to exist
  Rules of thumb: a full-wall backdrop needs a clear wall of roughly 6 ft or more and a ceiling near 8 ft; a balloon arch needs about 7 ft of height and 5 ft of width; a floor standee needs perimeter space that is not a walking path. If the focal wall is narrower than the item, that is a low score — say so rather than shrinking the room to fit.
- fitReason: one short sentence justifying the score against the actual measurements

START from the strongest anchor for this occasion — for almost every indoor event that is a backdrop or decorated focal wall, with everything else composed around it. Include it whenever it scores 3 or more. If it genuinely cannot fit, score it low, leave it out, and anchor the design on the best alternative (a decorated window, a table setup, a corner) instead. Never omit the anchor simply because the room looked busy — the movable items listed as removed are already gone.

- FLOOR & PLACEMENT CONSTRAINT: Never place items in open floor spaces, center-room rugs, or walking paths where guests need to walk. All floor-level items (such as standees, floor balloon clusters, or ground props) must be explicitly assigned to room perimeters, corners, against the base of walls, or directly tucked against heavy furniture (e.g., "anchored tightly against the base of the TV console").

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

  // Events only: drop anything the model itself said will not fit. The prompt
  // asks for an honest fitScore; this makes it binding, the same way
  // enforceVenueBranch makes the indoor/outdoor split binding rather than
  // requested. Without it a "1 — the wall is 3 ft, this backdrop is 8 ft"
  // still gets searched on Amazon, curated, and rendered into the room.
  return eventContext ? enforceFit(response.text ?? "") : (response.text ?? "");
}

const suggestionListSchema = {
  type: Type.OBJECT,
  properties: {
    suggestedProducts: { type: Type.ARRAY, items: suggestedProductSchema },
  },
  required: ["suggestedProducts"],
};

/**
 * Regenerate the "what to add" suggestion list after the user removes items in
 * the tidy-up step, so removing (e.g.) a sofa surfaces a NEW sofa as an option
 * plus fillers for the freed space — which the original analysis suppressed
 * because the item was still present. Cheap gemini-2.5-flash text call.
 */
export async function refreshSuggestions(
  imageBase64: string,
  roomAnalysis: RoomAnalysis,
  removeLabels: string[],
  // Events clear furniture to make room for decorations, not to shop for new
  // furniture. Without this the replace-what-you-removed rule below ran for
  // events too: a user cleared the TV wall for a Ganesh mandap and the
  // checklist came back offering a Smart TV, a TV console, a wall clock and
  // floating shelves — which recommendProducts then treats as REQUESTED item
  // types ("MUST include one product for each"), so a Rs 37,999 television
  // ended up in a Ganesh Chaturthi design.
  eventContext?: string
): Promise<string> {
  const remaining = roomAnalysis.existingFurniture.filter(
    (f) => !removeLabels.some((r) => f.toLowerCase().includes(r.toLowerCase()) || r.toLowerCase().includes(f.toLowerCase()))
  );

  if (eventContext) {
    const eventPrompt = `You are an event decoration planner. ${eventContext}

The user has cleared these items out of the room to make space for the event: ${removeLabels.join(", ")}.
What remains: ${remaining.join(", ") || "the room is mostly empty now"}.

Suggest 6-8 DECORATION products they could add, as a fresh checklist. IMPORTANT:
- NEVER suggest a replacement for anything they removed. They carried it out of the room for one day; they do not want to buy another one.
- NEVER suggest furniture, electronics or appliances — no TVs, media consoles, cabinets, shelving, wall clocks, sofas, tables, beds, storage units. This is a one-day decoration, not a room makeover.
- Suggest only occasion décor: backdrops, drapes, garlands, flowers, lights, rangoli, torans, idol stands and pedestals, lanterns, balloons, table styling and similar.
- The space freed by the removals is where the decoration goes — use it, do not refill it with furniture.
- Each has: "id" (short snake_case), "label" (human), "description" (referencing the occasion and the freed space), "icon" (single emoji), and "mount" ("wall", "ceiling", "surface" or "floor").`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: "image/jpeg", data: imageBase64 } },
            { text: eventPrompt },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: suggestionListSchema,
      },
    });

    return response.text ?? "";
  }

  const prompt = `You are an interior design analyst. The user is redesigning their ${roomAnalysis.dimensions} ${roomAnalysis.roomType} and has chosen to REMOVE these items from it: ${removeLabels.join(", ")}.

After removal, what remains: ${remaining.join(", ") || "the room is mostly empty now"}.

Suggest 6-8 products the user could ADD, as a fresh checklist. IMPORTANT:
- For each removed item that still has a functional need, suggest a REPLACEMENT (e.g. if the sofa was removed, DO suggest a new sofa/couch — the "don't suggest a sofa if one exists" rule no longer applies because it was removed).
- Also suggest items to fill the space freed up by the removals.
- Do NOT suggest a replacement for a removed item the user clearly wanted gone with no functional gap (use judgement).
- Keep suggestions realistic for THIS room. Each has: "id" (short snake_case), "label" (human), "description" (referencing the room / the removal), "icon" (single emoji).`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: "image/jpeg", data: imageBase64 } },
          { text: prompt },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: suggestionListSchema,
    },
  });

  return response.text ?? "";
}
