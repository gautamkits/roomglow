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

type RevealVariant = "full" | "simple";

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
  const allProducts = buyableProducts(design);
  // Default to 2 shop cards (clamped to what's available) for a fuller "shop" scene.
  const [cardCount, setCardCount] = useState(Math.min(2, allProducts.length));

  const supported = isRevealVideoSupported();
  const title = designTitle(design);
  const description = designDescription(design);
  const link = `${SITE_URL}/design/${design.id}`;
  const tags = designItems(design)
    .slice(0, 4)
    .map((t) => "#" + t.toLowerCase().replace(/[^a-z0-9]+/g, ""))
    .filter((t) => t.length > 1);
  const caption = `${title}\n\n${description}\n\n✨ See it & shop the look: ${link}\n\n${[
    "#noosho",
    "#interiordesign",
    "#homedecor",
    ...tags,
  ].join(" ")}`;

  const exportVideo = async () => {
    setBusy(true);
    setError(null);
    setPct(0);
    try {
      const beforeUrl = `/api/image/${design.id}/before?inline=1`;
      const afterUrl = `/api/image/${design.id}/after?inline=1`;

      let blob: Blob;
      if (variant === "simple") {
        // Original before→after wipe — no products / hotspots needed.
        blob = await generateSimpleRevealVideo(
          { beforeUrl, afterUrl },
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
          { beforeUrl, afterUrl, products },
          (f) => setPct(Math.round(f * 100))
        );
      }

      const suffix = variant === "simple" ? "beforeafter" : "reveal";
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
          <button
            onClick={exportVideo}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-orange-700 hover:bg-orange-800 text-white text-sm font-medium transition-colors disabled:opacity-60"
          >
            <Film size={15} />
            {prepping
              ? "Detecting product spots…"
              : busy
                ? `Rendering… ${pct}%`
                : "Export reveal MP4"}
          </button>
          <p className="mt-1.5 text-[11px] text-zinc-400">
            {variant === "simple"
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
