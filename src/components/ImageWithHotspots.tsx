"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { ExternalLink, Eye, EyeOff, Star, ShoppingBag } from "lucide-react";
import type { Hotspot, ProductResult } from "@/lib/types";
import ProductCard from "./ProductCard";

interface ImageWithHotspotsProps {
  imageSrc: string;
  hotspots: Hotspot[];
  products: ProductResult[];
  hidePrices?: boolean;
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
  hidePrices = false,
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

  // Spread overlapping markers apart so the numbers don't collide.
  const spread = useMemo(() => {
    const MIN = 9; // minimum gap between markers (in % units)
    const pts = hotspots.map((h) => ({ x: h.x, y: h.y }));
    for (let iter = 0; iter < 12; iter++) {
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          let dx = pts[j].x - pts[i].x;
          let dy = pts[j].y - pts[i].y;
          let dist = Math.hypot(dx, dy);
          if (dist === 0) {
            dx = (Math.random() - 0.5) * 0.1;
            dy = (Math.random() - 0.5) * 0.1;
            dist = Math.hypot(dx, dy) || 0.01;
          }
          if (dist < MIN) {
            const push = (MIN - dist) / 2;
            const ux = dx / dist;
            const uy = dy / dist;
            pts[i].x -= ux * push;
            pts[i].y -= uy * push;
            pts[j].x += ux * push;
            pts[j].y += uy * push;
          }
        }
      }
    }
    return pts.map((p) => ({
      x: Math.max(4, Math.min(96, p.x)),
      y: Math.max(5, Math.min(95, p.y)),
    }));
  }, [hotspots]);

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

          const pos = spread[index] ?? { x: hotspot.x, y: hotspot.y };
          const isHidden = hiddenProducts.has(hotspot.productIndex);
          const isActive = activeHotspot === index;
          const isRight = pos.x > 55;
          const isBottom = pos.y > 55;
          const title =
            product.amazonProduct?.title || product.recommendation.category;

          return (
            <div
              key={index}
              className="absolute"
              style={{
                left: `${pos.x}%`,
                top: `${pos.y}%`,
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

              {/* Desktop popup — hidden on mobile */}
              {isActive && !isHidden && (
                <div
                  className="absolute z-50 hidden sm:block"
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

      {/* ─── Mobile bottom sheet for active product ─── */}
      {activeHotspot !== null && (() => {
        const hotspot = hotspots[activeHotspot];
        const product = hotspot ? products[hotspot.productIndex] : null;
        if (!product || hiddenProducts.has(hotspot.productIndex)) return null;
        return (
          <div className="sm:hidden fixed inset-0 z-50" onClick={() => setActiveHotspot(null)}>
            <div className="absolute inset-0 bg-black/30" />
            <div className="absolute bottom-0 left-0 right-0" onClick={(e) => e.stopPropagation()}>
              <ProductCard
                variant="sheet"
                product={product}
                hidePrices={hidePrices}
                onClose={() => setActiveHotspot(null)}
                onHide={() => {
                  toggleProduct(hotspot.productIndex);
                  setActiveHotspot(null);
                }}
              />
            </div>
          </div>
        );
      })()}

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
        {!hidePrices && (
          <div className="px-4 py-3 bg-orange-50/60 dark:bg-orange-950/20 border-b border-zinc-100 dark:border-zinc-800 flex items-baseline justify-between">
            <span className="text-xs text-zinc-500">Estimated total</span>
            <span className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              {inr(total)}
            </span>
          </div>
        )}

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
                    className="w-10 h-10 object-contain shrink-0 rounded-md bg-stone-50 dark:bg-zinc-800 p-0.5"
                  />
                ) : (
                  <div className="w-10 h-10 shrink-0 rounded-md bg-stone-100 dark:bg-zinc-800" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-zinc-900 dark:text-zinc-100 line-clamp-2 leading-snug">
                    {ap?.title || product.recommendation.category}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {ap && !hidePrices && (
                      <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-50">
                        {ap.price}
                      </span>
                    )}
                    {ap && ap.rating > 0 && (
                      <span className="flex items-center gap-0.5 text-[10px] text-zinc-400">
                        <Star size={9} className="fill-amber-400 text-amber-400" />
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
                      {hidePrices ? "View" : "Buy"}
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
