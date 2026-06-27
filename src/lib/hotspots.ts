import { getDesign, setHotspots } from "@/lib/db";
import { detectHotspots } from "@/lib/gemini";
import type { ProductResult } from "@/lib/types";

function parseJsonish(v: unknown) {
  if (!v) return null;
  if (typeof v === "string") {
    try {
      return JSON.parse(v);
    } catch {
      return null;
    }
  }
  return v;
}

async function loadBase64(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith("data:")) {
    const m = url.match(/^data:image\/\w+;base64,(.+)$/);
    return m ? m[1] : null;
  }
  if (url.startsWith("http")) {
    const res = await fetch(url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer()).toString("base64");
  }
  return null;
}

/**
 * Lazily compute + persist product hotspots for a design the first time it
 * becomes entitled (unlocked). Hotspot detection is deferred off the locked
 * create path (P1-b); this fills them in at unlock time. No-op if the design
 * already has hotspots or can't be loaded. Safe to call fire-and-forget.
 */
export async function ensureHotspots(designId: string): Promise<void> {
  const d = await getDesign(designId);
  if (!d) return;

  const existing = parseJsonish(d.hotspots);
  if (Array.isArray(existing) && existing.length > 0) return;

  const products = (parseJsonish(d.products) as ProductResult[]) ?? [];
  if (products.length === 0) return;

  const base64 = await loadBase64(d.generated_image_url);
  if (!base64) return;

  const hotspots = await detectHotspots(
    base64,
    products.map((p) => ({
      category: p.recommendation.category,
      placement: p.recommendation.placement,
      title: p.amazonProduct?.title || p.recommendation.category,
    }))
  );
  await setHotspots(designId, hotspots);
}
