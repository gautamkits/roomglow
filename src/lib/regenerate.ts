import {
  recommendProducts,
  curateProducts,
  generateDesignImage,
  type CategoryCandidates,
} from "@/lib/gemini";
import { searchProducts } from "@/lib/amazon";
import { buildEventContext } from "@/lib/events";
import { smartBudgetInstruction, type SearchCategory } from "@/lib/budget";
import type { Locale } from "@/lib/locale";
import type {
  EventConfig,
  ProductRecommendation,
  ProductResult,
  RoomAnalysis,
  Hotspot,
} from "@/lib/types";

/**
 * Re-run the design pipeline server-side for an EXISTING design.
 *
 * The create flow orchestrates analyze → recommend → search → curate → generate
 * across five HTTP hops from the browser (see useRoomFlow.runPipeline). Here the
 * photo is unchanged, so the stored `room_analysis` is still valid and the
 * analyze step is skipped — we re-source products and re-render in one
 * server-side pass, calling the same lib functions the routes call.
 *
 * Re-sourcing (rather than just re-rendering the stored products) is the point:
 * changing the theme or colour changes the décor recipe, which changes what gets
 * bought. A pure re-render would only re-roll the picture.
 */
export interface RegenerateResult {
  generatedImage: string; // raw base64, no data: prefix
  hotspots: Hotspot[];
  products: ProductResult[];
  narrative: string;
}

async function fetchAsBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return Buffer.from(buf).toString("base64");
  } catch {
    return null;
  }
}

function parseJsonish<T>(raw: string, context: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    try {
      return JSON.parse(cleaned) as T;
    } catch {
      throw new Error(`${context}: model did not return valid JSON`);
    }
  }
}

export async function regenerateDesign(opts: {
  originalImageUrl: string;
  roomAnalysis: RoomAnalysis;
  mode: string;
  eventConfig: EventConfig | null;
  selectedItems: string[];
  locale: Locale;
  /**
   * Hotspot detection is a second billed model call and is only visible on an
   * unlocked design, so skip it when sending a locked (paid) design — the
   * normal unlock path backfills via ensureHotspots.
   */
  detect: boolean;
}): Promise<RegenerateResult> {
  const base64 = await fetchAsBase64(opts.originalImageUrl);
  if (!base64) throw new Error("Could not load the original photo");

  const isEvent = opts.mode === "event";
  const eventContext = buildEventContext(isEvent ? opts.eventConfig : null);

  // 1. What to buy — same call the create flow makes, reusing whatever the user
  //    originally picked as the requested item types.
  const recsRaw = await recommendProducts(
    opts.roomAnalysis,
    {},
    opts.selectedItems,
    eventContext,
    []
  );
  const { products: recs, designVision } = parseJsonish<{
    products: ProductRecommendation[];
    designVision: string;
  }>(recsRaw, "recommend");
  if (!recs?.length) throw new Error("No product recommendations came back");

  // 2. Source candidates, mirroring /api/search-products (same 5-per-category
  //    and the same fall back to the bare category when a query finds nothing).
  const categories: CategoryCandidates[] = await Promise.all(
    recs.map(async (rec) => {
      let candidates = await searchProducts(rec.searchQuery, 5, opts.locale);
      if (candidates.length === 0) {
        candidates = await searchProducts(rec.category, 5, opts.locale);
      }
      return {
        category: rec.category,
        placement: rec.placement,
        reason: rec.reason,
        colorSuggestion: rec.colorSuggestion,
        candidates,
      };
    })
  );

  // 3. Pick one per category.
  // curateProducts takes no eventContext today — the live create path doesn't
  // pass one either, so this stays byte-identical to what users get.
  const curationRaw = await curateProducts(
    base64,
    designVision || "Create a cohesive, stylish design",
    categories,
    smartBudgetInstruction(undefined, categories as SearchCategory[])
  );
  const curation = parseJsonish<{
    selections: { categoryIndex: number; optionIndex: number; reason: string }[];
    designNarrative: string;
  }>(curationRaw, "curate");

  // Mirrors the reassembly in /api/curate-products, including the guard against
  // the model returning an out-of-range category or option index.
  const products: ProductResult[] = [];
  for (const sel of curation.selections || []) {
    const cat = categories[sel.categoryIndex];
    if (!cat) continue;
    products.push({
      recommendation: {
        category: cat.category,
        placement: cat.placement,
        reason: sel.reason,
        colorSuggestion: cat.colorSuggestion,
        searchQuery: "",
      },
      amazonProduct: cat.candidates[sel.optionIndex] ?? cat.candidates[0] ?? null,
    });
  }

  if (!products.length) throw new Error("Curation returned no products");

  // 4. Render.
  const { generatedImage, hotspots } = await generateDesignImage(
    base64,
    products.map((p) => ({
      category: p.recommendation.category,
      placement: p.recommendation.placement,
      title: p.amazonProduct?.title || p.recommendation.category,
      colorSuggestion: p.recommendation.colorSuggestion,
      imageUrl: p.amazonProduct?.imageUrl || "",
    })),
    eventContext,
    undefined,
    opts.detect,
    opts.roomAnalysis?.geometry,
    false
  );

  return {
    generatedImage,
    hotspots: hotspots as Hotspot[],
    products,
    narrative: curation.designNarrative || "",
  };
}
