"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { ExternalLink, Eye, EyeOff, Star, ShoppingBag } from "lucide-react";
import type { Hotspot, ProductResult } from "@/lib/types";
import ProductCard from "./ProductCard";

interface ImageWithHotspotsProps {
  imageSrc: string;
  hotspots: Hotspot[];
  products: ProductResult[];
}

function parsePrice(s?: string): number {
  if (!s) return 0;
  const v = parseFloat(s.replace(/[^0-9.]/g, ""));
  return isNaN(v) ? 0 : v;
}

const inr = (n: number) =>
  "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });

export default function ImageWithHotspots({
  imageSrc,
  hotspots,
  products,
}: ImageWithHotspotsProps) {
  const [activeHotspot, setActiveHotspot] = useState<number | null>(null);
  const [hiddenProducts, setHiddenProducts] = useState<Set<number>>(new Set());
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toggleProduct = useCallback((productIndex: number) => {
    setHiddenProducts((prev) => {
      const next = new Set(prev);
      if (next.has(productIndex)) next.delete(productIndex);
      else next.add(productIndex);
      return next;
    });
  }, []);

  const open = useCallback((index: number) => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    setActiveHotspot(index);
  }, []);
  const openDelayed = useCallback((index: number) => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    hoverTimeout.current = setTimeout(() => setActiveHotspot(index), 120);
  }, []);
  const closeDelayed = useCallback(() => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    hoverTimeout.current = setTimeout(() => setActiveHotspot(null), 180);
  }, []);
  const cancelClose = useCallback(() => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActiveHotspot(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const visibleProducts = products.filter((_, i) => !hiddenProducts.has(i));
  const matched = visibleProducts.filter((p) => p.amazonProduct);
  const total = matched.reduce(
    (sum, p) => sum + parsePrice(p.amazonProduct?.price),
    0
  );

  return (
    <div className="grid lg:grid-cols-[1.6fr_1fr] gap-5 lg:gap-6 items-start">
      {/* ─── Design image with hotspots ─── */}
      <div
        className="relative w-full rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 shadow-md"
        onClick={() => setActiveHotspot(null)}
      >
        <img
          src={imageSrc}
          alt="Your room with the recommended products placed in it"
          className="w-full"
        />

        {hotspots.map((hotspot, index) => {
          const product = products[hotspot.productIndex];
          if (!product) return null;

          const isHidden = hiddenProducts.has(hotspot.productIndex);
          const isActive = activeHotspot === index;
          const isRight = hotspot.x > 55;
          const isBottom = hotspot.y > 55;
          const title =
            product.amazonProduct?.title || product.recommendation.category;

          return (
            <div
              key={index}
              className="absolute"
              style={{
                left: `${hotspot.x}%`,
                top: `${hotspot.y}%`,
                transform: "translate(-50%, -50%)",
              }}
              onMouseEnter={() => !isHidden && openDelayed(index)}
              onMouseLeave={closeDelayed}
            >
              <button
                aria-label={
                  isHidden
                    ? `Show product ${hotspot.productIndex + 1}: ${title}`
                    : `Product ${hotspot.productIndex + 1}: ${title}`
                }
                onClick={(e) => {
                  e.stopPropagation();
                  if (isHidden) toggleProduct(hotspot.productIndex);
                  else setActiveHotspot(isActive ? null : index);
                }}
                onFocus={() => !isHidden && open(index)}
                className={`rounded-full flex items-center justify-center text-xs font-semibold transition-all outline-none focus-visible:ring-2 focus-visible:ring-orange-700 focus-visible:ring-offset-2 ${
                  isHidden
                    ? "w-6 h-6 bg-zinc-400/60 text-white z-10"
                    : isActive
                      ? "w-7 h-7 bg-orange-700 text-white scale-110 z-30"
                      : "w-7 h-7 bg-white text-zinc-900 border border-zinc-300 hover:border-zinc-400 z-10 shadow-sm"
                }`}
              >
                {isHidden ? <EyeOff size={12} /> : hotspot.productIndex + 1}
              </button>

              {isActive && !isHidden && (
                <div
                  className="absolute z-50"
                  style={{
                    [isRight ? "right" : "left"]: "2.25rem",
                    [isBottom ? "bottom" : "top"]: "-0.5rem",
                  }}
                  onMouseEnter={cancelClose}
                  onMouseLeave={closeDelayed}
                >
                  <ProductCard
                    product={product}
                    onClose={() => setActiveHotspot(null)}
                    onHide={() => {
                      toggleProduct(hotspot.productIndex);
                      setActiveHotspot(null);
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ─── Shop the look sidebar ─── */}
      <aside className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <ShoppingBag size={16} className="text-orange-700" />
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Shop the look
            </h3>
          </div>
          <span className="text-xs text-zinc-400">
            {matched.length} item{matched.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Cost summary */}
        <div className="px-4 py-3 bg-orange-50/60 dark:bg-orange-950/20 border-b border-zinc-100 dark:border-zinc-800 flex items-baseline justify-between">
          <span className="text-xs text-zinc-500">Estimated total</span>
          <span className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            {inr(total)}
          </span>
        </div>

        {/* Product list */}
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800 max-h-[460px] overflow-y-auto">
          {products.map((product, i) => {
            const isHidden = hiddenProducts.has(i);
            const ap = product.amazonProduct;
            return (
              <li
                key={i}
                className={`flex items-center gap-3 px-4 py-3 transition-opacity ${
                  isHidden ? "opacity-45" : ""
                }`}
              >
                <span className="w-5 h-5 rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 flex items-center justify-center text-[11px] font-semibold shrink-0">
                  {i + 1}
                </span>
                {ap?.imageUrl ? (
                  <img
                    src={ap.imageUrl}
                    alt={ap.title}
                    className="w-12 h-12 object-contain shrink-0 rounded-md bg-stone-50 dark:bg-zinc-800 p-1"
                  />
                ) : (
                  <div className="w-12 h-12 shrink-0 rounded-md bg-stone-100 dark:bg-zinc-800" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 line-clamp-1">
                    {ap?.title || product.recommendation.category}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {ap && (
                      <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                        {ap.price}
                      </span>
                    )}
                    {ap && ap.rating > 0 && (
                      <span className="flex items-center gap-0.5 text-[11px] text-zinc-400">
                        <Star size={10} className="fill-amber-400 text-amber-400" />
                        {ap.rating.toFixed(1)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  {ap && (
                    <a
                      href={ap.affiliateUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-orange-700 hover:bg-orange-800 text-white text-xs font-medium rounded-md transition-colors"
                    >
                      Buy
                      <ExternalLink size={11} />
                    </a>
                  )}
                  <button
                    onClick={() => toggleProduct(i)}
                    aria-label={isHidden ? "Show in design" : "Hide from design"}
                    className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                  >
                    {isHidden ? <Eye size={12} /> : <EyeOff size={12} />}
                    {isHidden ? "Show" : "Hide"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </aside>
    </div>
  );
}
