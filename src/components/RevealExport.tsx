"use client";

import { useState } from "react";
import { Film, Copy, Check, Download } from "lucide-react";
import { SITE_URL } from "@/lib/site";
import { designTitle, designDescription, designItems } from "@/lib/admin";
import {
  generateRevealVideo,
  isRevealVideoSupported,
  type RevealProduct,
} from "@/lib/revealVideo";
import { generateSimpleRevealVideo } from "@/lib/simpleRevealVideo";
import { designTotal } from "@/lib/price";
import type { ProductResult } from "@/lib/types";

type RevealVariant = "full" | "simple" | "explain";

type ExplainScript = {
  lines: string[];
  products: { title: string; price: string; imageUrl: string; x?: number; y?: number }[];
  /** "Buy everything for ₹12,400" — null when no product has a price. */
  total?: string | null;
};

interface ParsedProduct {
  amazonProduct?: { title?: string; price?: string; imageUrl?: string } | null;
  recommendation?: { category?: string } | null;
}

function parseJsonish<T>(raw: unknown): T[] {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }
  return Array.isArray(raw) ? (raw as T[]) : [];
}

/** Top buyable products (image + price) joined to their hotspot, proxied for the canvas. */
function buyableProducts(
  design: RevealDesign,
  hotspotsOverride?: unknown
): RevealProduct[] {
  const prods = parseJsonish<ParsedProduct>(design.products);
  const hotspots = parseJsonish<{ productIndex: number; x: number; y: number }>(
    hotspotsOverride !== undefined ? hotspotsOverride : design.hotspots
  );

  const buyable = prods
    .map((p, i): RevealProduct | null => {
      const ap = p.amazonProduct;
      if (!ap || !ap.imageUrl || !ap.price) return null;
      const hs = hotspots.find((h) => h.productIndex === i);
      return {
        imageUrl: `/api/proxy-image?url=${encodeURIComponent(ap.imageUrl)}`,
        title: ap.title || "Featured product",
        price: ap.price,
        x: hs?.x,
        y: hs?.y,
      };
    })
    .filter((p): p is RevealProduct => p !== null);

  // Prefer products that have a hotspot (so the arrow has a real target).
  buyable.sort((a, b) => (b.x != null ? 1 : 0) - (a.x != null ? 1 : 0));
  return buyable.slice(0, 2);
}

export interface RevealDesign {
  id: string;
  mode?: string;
  room_analysis?: Record<string, unknown> | string | null;
  event_config?: Record<string, unknown> | string | null;
  design_narrative?: string;
  products?: unknown;
  hotspots?: unknown;
  selected_items?: unknown;
  /** When set and not "approved", the design page is private — see `link`. */
  gallery_status?: string | null;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export default function RevealExport({ design }: { design: RevealDesign }) {
  const [busy, setBusy] = useState(false);
  const [prepping, setPrepping] = useState(false);
  const [pct, setPct] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [variant, setVariant] = useState<RevealVariant>("full");
  const [outro, setOutro] = useState(true);
  const [noosho, setNoosho] = useState(true);
  // "Noosho explains": per-design script (editable) + TTS voice.
  const [script, setScript] = useState<ExplainScript | null>(null);
  const [scriptText, setScriptText] = useState("");
  const [voice, setVoice] = useState<"Laomedeia" | "Leda">("Laomedeia");
  const [stage, setStage] = useState<string | null>(null);
  const [seenLines, setSeenLines] = useState<string[]>([]);
  const allProducts = buyableProducts(design);
  // Deliberately NOT from `allProducts` — that list is filtered to products with
  // an image AND price and then sliced to 2 for the shop cards, so totalling it
  // would quote roughly a third of a six-item design's real basket.
  const basket = designTotal(
    parseJsonish<ProductResult>(design.products)
  );
  const [priceLine, setPriceLine] = useState(
    basket
      ? `Buy everything ${basket.partial ? "from " : "for "}${basket.formatted}`
      : ""
  );
  const [ctaLine, setCtaLine] = useState("Comment HI for the shopping list");
  // Default to 2 shop cards (clamped to what's available) for a fuller "shop" scene.
  const [cardCount, setCardCount] = useState(Math.min(2, allProducts.length));

  const supported = isRevealVideoSupported();
  const title = designTitle(design);
  const description = designDescription(design);
  // An unpublished design's page is private: a viewer tapping the caption link
  // from Instagram would hit the access gate. Point those at the homepage
  // instead. Absent status (older callers) keeps the design link, so published
  // exports are unchanged.
  const isPublic = design.gallery_status == null || design.gallery_status === "approved";
  const link = isPublic ? `${SITE_URL}/design/${design.id}` : SITE_URL;
  const linkLead = isPublic ? "✨ See it & shop the look" : "✨ Redesign your own room";
  const tags = designItems(design)
    .slice(0, 4)
    .map((t) => "#" + t.toLowerCase().replace(/[^a-z0-9]+/g, ""))
    .filter((t) => t.length > 1);
  // The video says "comment HI"; Instagram DM automation fires on the comment,
  // but the caption is where viewers are actually told to leave one — so both
  // surfaces have to carry the same ask or the video's CTA goes unexplained.
  const captionCta = ctaLine.trim() ? `\n\n${ctaLine.trim()}` : "";
  const caption = `${title}\n\n${description}${captionCta}\n\n${linkLead}: ${link}\n\n${[
    "#noosho",
    "#interiordesign",
    "#homedecor",
    ...tags,
  ].join(" ")}`;

  const writeScript = async () => {
    setBusy(true);
    setError(null);
    setStage("Noosho is writing her lines…");
    try {
      const r = await fetch("/api/admin/noosho-explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // earlier takes' first three lines, so a Rewrite says something new
        body: JSON.stringify({ action: "script", designId: design.id, avoid: seenLines }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Couldn't write the script.");
      setScript(d);
      setScriptText(d.lines.join("\n"));
      setSeenLines((prev) => [...prev, ...d.lines.slice(0, 3)].slice(-12));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't write the script.");
    } finally {
      setBusy(false);
      setStage(null);
    }
  };

  const renderExplain = async (): Promise<Blob> => {
    if (!script) throw new Error("Write the script first.");
    const lines = scriptText.split("\n").map((l) => l.trim()).filter(Boolean);
    // Scenes are keyed by line position: hello, before, after, one per product, outro.
    // hello, before, ta-da, [buy everything], outro
    // hello, before, ta-da, real products, outro — scenes are keyed by position
    if (lines.length !== 5) {
      throw new Error("Keep 5 lines (hello, before, ta-da, real products, outro) — edit the words, not the count.");
    }
    const { pickPrices } = await import("@/lib/promo/explainPrices");
    setStage("Recording Noosho's voice…");
    const r = await fetch("/api/admin/noosho-explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // one "pop" per price the video pins, a chime if the total badge shows
      body: JSON.stringify({
        action: "voice",
        designId: design.id,
        lines,
        voice,
        prices: pickPrices(script.products).length,
        total: !!script.total,
      }),
    });
    const vo = await r.json();
    if (!r.ok) throw new Error(vo.error || "Voice generation failed.");

    setStage("Getting Noosho ready…");
    const [promo, style, rv] = await Promise.all([
      import("@/lib/promo/promo"),
      import("@/lib/promo/styles/explain"),
      import("@/lib/revealVideo"),
    ]);
    const [kit, envelope, before, after, products] = await Promise.all([
      promo.loadNooshoKit(),
      promo.loadVoiceEnvelope(vo.url),
      rv.loadImage(`/api/image/${design.id}/before?inline=1`),
      rv.loadImage(`/api/image/${design.id}/after?inline=1`),
      Promise.all(
        script.products.map(async (p) => ({
          img: await rv.loadImage(`/api/proxy-image?url=${encodeURIComponent(p.imageUrl)}`),
          title: p.title,
          price: p.price,
          x: p.x,
          y: p.y,
        }))
      ),
    ]);
    if (!kit) throw new Error("Couldn't draw Noosho.");
    const assets = { ...kit, envelope, before, after, cards: [], products: [], gallery: [] };
    const tl = style.explainTimeline(vo.segments, lines);
    setStage(null);
    const render = style.makeExplainRender({ products, total: script.total });
    const onProgress = (f: number) => setPct(Math.round(f * 100));

    if (await promo.canEncodeAac()) {
      return promo.generatePromoVideo(assets, tl, { voiceUrl: vo.url, render, onProgress });
    }
    // Phones: no AAC encoder in the browser, and an Opus track plays silent in
    // galleries and Instagram. Render silently (lip-sync still runs off the
    // voice), then the server adds the voice as AAC.
    const silent = await promo.generatePromoVideo(assets, tl, { voice: false, render, onProgress });
    setStage("Adding Noosho's voice…");
    const { upload } = await import("@vercel/blob/client");
    const up = await upload(`promo-tmp/${design.id}.mp4`, silent, {
      access: "public",
      handleUploadUrl: "/api/admin/noosho-explain/upload",
      contentType: "video/mp4",
    });
    const m = await fetch("/api/admin/noosho-explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mux", designId: design.id, videoUrl: up.url, audioUrl: vo.url }),
    });
    const mx = await m.json();
    if (!m.ok) throw new Error(mx.error || "Couldn't add the voice.");
    const out = await fetch(mx.url);
    if (!out.ok) throw new Error("Couldn't download the finished video.");
    setStage(null);
    return out.blob();
  };

  const exportVideo = async () => {
    setBusy(true);
    setError(null);
    setPct(0);
    try {
      const beforeUrl = `/api/image/${design.id}/before?inline=1`;
      const afterUrl = `/api/image/${design.id}/after?inline=1`;

      let blob: Blob;
      if (variant === "explain") {
        blob = await renderExplain();
      } else if (variant === "simple") {
        // Original before→after wipe — no products / hotspots needed.
        blob = await generateSimpleRevealVideo(
          {
            beforeUrl,
            afterUrl,
            outro,
            noosho,
            offer: { priceLine, ctaLine },
          },
          (f) => setPct(Math.round(f * 100))
        );
      } else {
        // The in-scene arrow needs product positions (hotspots). They're computed
        // lazily, so older/gallery designs may have none — generate them on demand
        // so the export gets the arrow callout instead of the plain card.
        let products = allProducts.slice(0, cardCount);
        if (cardCount > 0 && products.some((p) => p.x == null)) {
          setPrepping(true);
          try {
            const r = await fetch("/api/admin/ensure-hotspots", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ designId: design.id }),
            });
            if (r.ok) {
              const { hotspots } = await r.json();
              products = buyableProducts(design, hotspots).slice(0, cardCount);
            }
          } catch {
            /* fall back to centered cards */
          } finally {
            setPrepping(false);
          }
        }

        blob = await generateRevealVideo(
          { beforeUrl, afterUrl, products, outro },
          (f) => setPct(Math.round(f * 100))
        );
      }

      const suffix = variant === "simple" ? "beforeafter" : variant === "explain" ? "explains" : "reveal";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `noosho-${slugify(title) || design.id.slice(0, 8)}-${suffix}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setBusy(false);
      setStage(null);
    }
  };

  const copyCaption = async () => {
    try {
      await navigator.clipboard.writeText(caption);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Couldn't copy — select the text manually.");
    }
  };

  return (
    <div className="mt-3 border-t border-zinc-200 dark:border-zinc-800 pt-3">
      {supported ? (
        <>
          <div className="mb-2 flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 px-2.5 py-1.5 text-[11px] text-zinc-500">
            <Film size={13} className="text-orange-700" />
            9:16 · 1080×1920 · whole photo shown
          </div>
          {/* Version picker: full branded commercial vs. original before/after wipe. */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] text-zinc-400 shrink-0">Style</span>
            <div className="flex items-center gap-1 flex-1 rounded-lg border border-zinc-200 dark:border-zinc-800 p-0.5">
              {([
                { id: "full", label: "Full commercial" },
                { id: "simple", label: "Before/after" },
                { id: "explain", label: "Noosho explains" },
              ] as const).map((v) => (
                <button
                  key={v.id}
                  onClick={() => setVariant(v.id)}
                  disabled={busy}
                  className={`flex-1 px-2 py-1 rounded-md text-xs font-medium transition-colors disabled:opacity-60 ${
                    variant === v.id
                      ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                      : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>
          {variant === "full" && allProducts.length > 0 && (
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] text-zinc-400 shrink-0">Shop cards</span>
              <div className="flex items-center gap-1 flex-1 rounded-lg border border-zinc-200 dark:border-zinc-800 p-0.5">
                {Array.from({ length: Math.min(allProducts.length, 3) + 1 }, (_, n) => (
                  <button
                    key={n}
                    onClick={() => setCardCount(n)}
                    disabled={busy}
                    className={`flex-1 px-2 py-1 rounded-md text-xs font-medium transition-colors disabled:opacity-60 ${
                      cardCount === n
                        ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                        : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                    }`}
                  >
                    {n === 0 ? "None" : n}
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* Engagement caption burned into the before/after export. Editable so
              the offer wording can be tuned per post without a deploy. */}
          {variant === "simple" && (
            <div className="mb-2 space-y-1.5">
              <span className="text-[11px] text-zinc-400">On-video caption</span>
              <input
                type="text"
                value={priceLine}
                onChange={(e) => setPriceLine(e.target.value)}
                disabled={busy}
                placeholder={
                  basket ? "Price line" : "No product prices on this design"
                }
                className="w-full px-2.5 py-1.5 rounded-lg text-xs border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 outline-none focus:border-orange-700 transition-colors disabled:opacity-60"
              />
              <input
                type="text"
                value={ctaLine}
                onChange={(e) => setCtaLine(e.target.value)}
                disabled={busy}
                placeholder="Comment prompt"
                className="w-full px-2.5 py-1.5 rounded-lg text-xs border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 outline-none focus:border-orange-700 transition-colors disabled:opacity-60"
              />
              {basket?.partial && (
                <p className="text-[10px] text-amber-600 dark:text-amber-500">
                  {basket.priced} of{" "}
                  {parseJsonish<ProductResult>(design.products).filter(
                    (p) => p.amazonProduct
                  ).length}{" "}
                  products have a price — total is a floor, hence &quot;from&quot;.
                </p>
              )}
            </div>
          )}
          {/* Noosho pushes the divider — before/after variant only. */}
          {variant === "simple" && (
            <label className="flex items-center gap-2 mb-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={noosho}
                onChange={(e) => setNoosho(e.target.checked)}
                disabled={busy}
                className="accent-orange-700"
              />
              <span className="text-[11px] text-zinc-500">Noosho slides it</span>
            </label>
          )}
          {variant === "explain" && (
            <div className="mb-2 space-y-1.5">
              {!script ? (
                <button
                  onClick={writeScript}
                  disabled={busy}
                  className="w-full py-1.5 rounded-lg border border-orange-700 text-orange-700 text-xs font-medium hover:bg-orange-50 dark:hover:bg-zinc-900 disabled:opacity-60"
                >
                  {busy ? stage : "Write Noosho's script"}
                </button>
              ) : (
                <>
                  <span className="text-[11px] text-zinc-400">
                    Script: one line per scene (edit the words, keep the line count)
                  </span>
                  <textarea
                    value={scriptText}
                    onChange={(e) => setScriptText(e.target.value)}
                    disabled={busy}
                    rows={Math.min(9, script.lines.length + 1)}
                    className="w-full px-2.5 py-1.5 rounded-lg text-xs border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 outline-none focus:border-orange-700 disabled:opacity-60"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={writeScript}
                      disabled={busy}
                      className="ml-auto text-[11px] text-orange-700 hover:underline disabled:opacity-60"
                    >
                      Rewrite
                    </button>
                  </div>
                  <label className="flex items-center gap-2 text-[11px] text-zinc-500">
                    Voice
                    <select
                      value={voice}
                      onChange={(e) => setVoice(e.target.value as "Laomedeia" | "Leda")}
                      disabled={busy}
                      className="px-1.5 py-0.5 rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"
                    >
                      <option value="Laomedeia">Laomedeia (Indian accent)</option>
                      <option value="Leda">Leda</option>
                    </select>
                  </label>
                </>
              )}
            </div>
          )}
          {/* Pre-rendered brand outro clip (carries its own CTA), appended last. */}
          {variant !== "explain" && (
          <label className="flex items-center gap-2 mb-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={outro}
              onChange={(e) => setOutro(e.target.checked)}
              disabled={busy}
              className="accent-orange-700"
            />
            <span className="text-[11px] text-zinc-500">
              Append brand outro <span className="text-zinc-400">(+2.9s, with CTA)</span>
            </span>
          </label>
          )}
          <button
            onClick={exportVideo}
            disabled={busy || (variant === "explain" && !script)}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-orange-700 hover:bg-orange-800 text-white text-sm font-medium transition-colors disabled:opacity-60"
          >
            <Film size={15} />
            {stage && script
              ? stage
              : prepping
              ? "Detecting product spots…"
              : busy
                ? `Rendering… ${pct}%`
                : "Export reveal MP4"}
          </button>
          <p className="mt-1.5 text-[11px] text-zinc-400">
            {variant === "explain"
              ? "Noosho says hello, shows the before, the new look and its colours, then each product with its price. Voice + captions."
              : variant === "simple"
              ? "Before → after wipe with the noosho watermark. Ready for Reels/Shorts."
              : "Logo intro → upload → style → reveal → shop → noosho.com. Ready for Reels/Shorts."}
          </p>
        </>
      ) : (
        <div className="text-xs text-zinc-500">
          <p className="mb-1.5">Open in Chrome or Edge to export the MP4.</p>
          <a
            href={`/api/share/${design.id}`}
            download={`noosho-${design.id.slice(0, 8)}.gif`}
            className="inline-flex items-center gap-1.5 text-orange-700 hover:text-orange-800 font-medium"
          >
            <Download size={14} /> Download GIF instead
          </a>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      <div className="mt-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] uppercase tracking-wide text-zinc-400">
            Caption
          </span>
          <button
            onClick={copyCaption}
            className="inline-flex items-center gap-1 text-xs text-orange-700 hover:text-orange-800 font-medium"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? "Copied" : "Copy caption"}
          </button>
        </div>
        <pre className="whitespace-pre-wrap break-words text-xs text-zinc-600 dark:text-zinc-300 bg-stone-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg p-2.5 font-sans leading-relaxed">
{caption}
        </pre>
      </div>
    </div>
  );
}
