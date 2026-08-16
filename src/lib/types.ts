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
  /** Events only. Decides whether focal staging applies at all — see
   *  {@link StagingPlan}. Absent on space designs and on anything analyzed
   *  before the indoor/outdoor split. */
  venueKind?: VenueKind;
  /** Indoor events only. Absent for outdoor venues by design. */
  stagingPlan?: StagingPlan;
  /**
   * Set by /api/analyze-room from the `always_empty_space` / `always_empty_event`
   * admin flags — NOT produced by the model, and deliberately not part of
   * `roomAnalysisSchema`, which is shared across both prompt branches.
   * Absent/false means the existing tidy-up flow, which is the shipped default.
   */
  alwaysEmpty?: boolean;
  questions: Question[]; // kept for backwards compatibility
}

/**
 * Things we never propose clearing, however much easier an empty room would be
 * to decorate.
 *
 * A household shrine is not clutter, and "we deleted your mandir to fit a
 * balloon arch" is not a recoverable mistake. The same goes for a national
 * flag, a portrait of a relative, or an appliance nobody is going to carry out
 * of the room for one afternoon. These still appear in the tidy-up list — the
 * occupant may genuinely want the fish tank out of shot — they are simply never
 * ticked on their behalf.
 */
const PROTECTED_LABEL_TERMS = [
  // Devotional — generic
  "temple", "mandir", "shrine", "altar", "idol", "deity", "puja", "pooja",
  "cross", "crucifix", "menorah", "prayer", "religious", "sacred", "holy",
  "diya", "tulsi", "rosary", "icon",
  // Devotional — named. A real analysis returned "Corner Plant and Buddha
  // Statue" and the generic terms above did not catch it. Deities get named,
  // not described, so the names have to be listed.
  "buddha", "ganesh", "ganpati", "ganesha", "krishna", "shiva", "vishnu",
  "lakshmi", "laxmi", "saraswati", "hanuman", "durga", "kali", "sai baba",
  "guru nanak", "jesus", "christ", "virgin mary", "murti", "nataraj",
  // Personal / irreplaceable
  "flag", "framed photo", "family photo", "portrait",
  // Living or genuinely immovable
  "aquarium", "fish tank", "piano", "air conditioner", "refrigerator",
  "fridge", "washing machine",
];

export function isProtectedLabel(label: string): boolean {
  const l = label.toLowerCase();
  return PROTECTED_LABEL_TERMS.some((t) => l.includes(t));
}

/**
 * What we pre-tick in tidy-up: for an indoor event, everything movable except
 * the protected items above.
 *
 * The failure this fixes is a real one — a "cluttered" living room where the
 * analysis correctly listed eight removable objects, the user ticked none, and
 * we rendered a birthday over an untouched pile of clothes, a ride-on toy and a
 * bean bag. Leaving the whole decision to an unticked checkbox list meant the
 * default outcome was the worst one.
 *
 * It used to propose only trivial-effort items plus anything blocking the focal
 * zone, which left the room half-full: the decorator model got a sofa, a TV
 * unit and a dining table to work around, and the designs came out cramped. An
 * event is one afternoon in a room the occupant is willing to rearrange, so the
 * honest default is a cleared room — presented as a checklist they can veto
 * item by item, never as something done silently.
 */
export function recommendedClears(
  objects: RemovableObject[],
  focalZone?: string,
  // Passed by the caller from the flow's own mode. NOT inferred from the
  // analysis, because `stagingPlan` leaks: measured on a real space photo,
  // 1 run in 8 came back with a focalZone despite no event context. Under the
  // old trivial/blocksFocal filter that leak pre-ticked nothing here; under
  // clear-all it would have pre-ticked the occupant's sectional sofa, coffee
  // table and high chair for deletion in a flow that defaults to keeping
  // everything. `isEvent` is the one signal that cannot be invented by the
  // model, so clearing is gated on it and defaults to false.
  isEvent = false
): string[] {
  // Gated on the staging plan, not on the fields being populated.
  //
  // `blocksFocal` is in a schema shared with space redesigns, whose prompt
  // never mentions it — and the model fills it in anyway. Measured on a real
  // space analysis: zero objects got an `effort`, but two got `blocksFocal`,
  // which was enough to pre-tick two BEDS for removal. Without a focal zone the
  // flag has nothing to be relative to, so it means nothing and we recommend
  // nothing. Space keeps its long-standing keep-everything default.
  if (!focalZone || !isEvent) return [];

  return objects
    .filter((o) => !isProtectedLabel(o.label))
    .map((o) => o.label);
}

export type ClutterLevel = "clean" | "moderate" | "cluttered";

/**
 * Indoor room/hall vs open-air ground, for events.
 *
 * Focal staging is an INDOOR idea. A room has one wall a guest naturally faces,
 * so concentrating the decoration there reads as designed. An open ground —
 * a school campus, a lawn, a terrace — has no such wall, and forcing everything
 * into one "focal zone" looked wrong in testing. Outdoor venues keep the
 * pre-staging behaviour: several separate decorated moments spread across the
 * space.
 */
export type VenueKind = "indoor" | "outdoor";

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
  // WHO the celebration is for, as a relationship id (see CELEBRATION_FOR in
  // lib/events.ts) — not the honoree's name. A 5-year-old's birthday and a
  // father's 60th were rendering the same balloon-arch-and-cutouts set, because
  // nothing in the brief distinguished them. Optional: events without a
  // `celebrationFor` list never ask, and an unanswered picker changes nothing.
  celebrationFor?: string;
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
