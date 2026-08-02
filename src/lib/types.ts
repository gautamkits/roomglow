/** Estimated real-world geometry of the photographed space, derived from
 *  visible scale references (doors ≈ 6.7 ft, sofas ≈ 6 ft, switches ≈ 4 ft
 *  high). Approximate by nature — used to ground generation at plausible
 *  scale, not for exact measurement. */
export interface RoomGeometry {
  approxWidthFt: number;
  approxDepthFt: number;
  approxCeilingFt: number;
  /** Visible objects with known typical sizes, e.g. "door on left wall (~6.7 ft tall)". */
  scaleReferences: string[];
}

export interface RoomAnalysis {
  roomType: string;
  currentStyle: string;
  dimensions: string;
  /** Optional: absent on designs analyzed before geometry estimation existed. */
  geometry?: RoomGeometry;
  existingFurniture: string[];
  lightingCondition: string;
  colorPalette: string[];
  suggestedProducts: SuggestedProduct[];
  clutterLevel: ClutterLevel;
  removableObjects: RemovableObject[];
  /** Optional: absent on designs analyzed before staging existed. */
  stagingPlan?: StagingPlan;
  questions: Question[]; // kept for backwards compatibility
}

/**
 * What we pre-tick in tidy-up: everything cheap to move, plus anything at all
 * that competes with the focal zone.
 *
 * The failure this fixes is a real one — a "cluttered" living room where the
 * analysis correctly listed eight removable objects, the user ticked none, and
 * we rendered a birthday over an untouched pile of clothes, a ride-on toy and a
 * bean bag. Leaving the whole decision to an unticked checkbox list meant the
 * default outcome was the worst one.
 *
 * Heavy items are only proposed when they actually block the focal zone —
 * asking someone to shift a sofa for a better backdrop is reasonable, asking
 * them to shift it for nothing is not.
 */
export function recommendedClears(objects: RemovableObject[]): string[] {
  return objects
    .filter((o) => o.effort === "trivial" || o.blocksFocal)
    .map((o) => o.label);
}

export type ClutterLevel = "clean" | "moderate" | "cluttered";

export interface RemovableObject {
  id: string;
  label: string;
  /** id of the object this one rests on / is supported by (e.g. a basket on a
   *  table), if any — so clearing/redesign never leaves it floating. */
  restsOn?: string;
  /** How much work it is for the occupant to actually move this before the
   *  event. Drives what we pre-tick in tidy-up: a bean bag or a hooked-on
   *  photo frame is a ten-second job, a sofa is a two-person job we should
   *  only ask for when it genuinely unblocks the focal zone. */
  effort?: "trivial" | "moderate" | "heavy";
  /** Sits in, or visually competes with, the focal zone. A framed picture in
   *  the middle of the backdrop wall is `trivial` + `blocksFocal` — the single
   *  highest-value thing to clear. */
  blocksFocal?: boolean;
  /** Shown to the user in tidy-up so the ask is justified, not arbitrary. */
  clearReason?: string;
}

/**
 * Where the decoration is built.
 *
 * Without this every product got a `placement` assigned in isolation, so a
 * 7-item birthday spread across a banner over the bed, decals on a second wall,
 * three items on one 5.5ft TV console and cushions in a third corner. Naming
 * one focal zone up front is what turns a pile of items into a composition.
 */
export interface StagingPlan {
  /** The one area the design is built around, phrased so the renderer can
   *  locate it in the photo, e.g. "the wall behind the television console". */
  focalZone: string;
  focalReason: string;
  /** At most two areas that get light supporting treatment. */
  supportingZones: string[];
}

export interface Question {
  id: string;
  question: string;
  options: QuestionOption[];
}

export interface QuestionOption {
  label: string;
  value: string;
}

export interface ProductRecommendation {
  category: string;
  searchQuery: string;
  placement: string;
  reason: string;
  colorSuggestion: string;
}

export interface AmazonProduct {
  title: string;
  price: string;
  imageUrl: string;
  affiliateUrl: string;
  rating: number;
  asin: string;
}

export type ProductMatchStatus = "ok" | "no_results" | "upstream_error";

export interface ProductResult {
  recommendation: ProductRecommendation;
  amazonProduct: AmazonProduct | null;
  /** Why `amazonProduct` is null, so the UI can offer a retry on a transient
   *  outage instead of claiming nothing exists. Absent on designs saved before
   *  status tracking existed — treat as "no_results". */
  matchStatus?: ProductMatchStatus;
  /** Tagged Amazon search URL, shown as the fallback when there is no match. */
  searchUrl?: string;
}

// A complementary, occasion-specific buyable shown in the "Complete the occasion"
// grid for event designs. Not placed in the image — purely shoppable.
export interface OccasionProduct {
  category: string;
  title: string;
  price: string;
  imageUrl: string;
  affiliateUrl: string;
  rating: number;
  asin: string;
}

export interface Hotspot {
  productIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SuggestedProduct {
  id: string;
  label: string;
  description: string;
  icon: string;
}

export type AppMode = "space" | "event" | "makeover";

export interface MakeoverConfig {
  styleType: string;
  styleLabel: string;
  gender?: string;
}

export interface PersonAnalysis {
  bodyType: string;
  skinTone: string;
  currentStyle: string;
  colorPalette: string[];
  hairDescription: string;
  suggestedItems: SuggestedProduct[];
}

export interface OutfitRecommendation {
  category: string;
  searchQuery: string;
  placement: string;
  reason: string;
  colorSuggestion: string;
}

export interface EventConfig {
  eventType: string;
  eventLabel: string;
  subTheme: string;
  colorScheme: string;
  honoree?: string;
  eventDate?: string;
  gender?: string;
}

export type FlowStep =
  | "mode-select"
  | "event-setup"
  | "upload"
  | "analyzing"
  | "product-selection"
  | "tidy-up"
  | "generating"
  | "curating"
  | "results";
