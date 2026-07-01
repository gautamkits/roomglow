"use client";

import { useEffect, useState } from "react";
import { Star, ExternalLink, Sparkles } from "lucide-react";
import type { OccasionProduct } from "@/lib/types";
import { outboundHref } from "@/lib/outbound";

interface MakeoverProductsProps {
  styleId: string;
  gender?: string;
}

// Self-contained, async "Complete the look" grid for makeovers. Fetches its own
// data after mount so it never blocks the design render. Renders nothing on
// empty/error. Links cloaked via outboundHref (global affiliate policy).
export default function MakeoverProducts({ styleId, gender }: MakeoverProductsProps) {
  const [products, setProducts] = useState<OccasionProduct[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch("/api/makeover-products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ styleId, gender }),
    })
      .then((r) => (r.ok ? r.json() : { products: [] }))
      .then((d) => {
        if (active) setProducts(d.products || []);
      })
      .catch(() => {
        if (active) setProducts([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [styleId, gender]);

  if (!loading && (!products || products.length === 0)) return null;

  return (
    <div className="mt-10 animate-fade-up-delay-2">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles size={16} className="text-orange-700" />
        <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
          Complete the look
        </h3>
      </div>
      <p className="text-sm text-zinc-500 mb-4">
        A few accessories we curated to finish off your outfit.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {loading
          ? Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 animate-pulse"
              >
                <div className="w-full h-28 rounded-lg bg-zinc-100 dark:bg-zinc-800 mb-2.5" />
                <div className="h-3 bg-zinc-100 dark:bg-zinc-800 rounded mb-2" />
                <div className="h-3 w-2/3 bg-zinc-100 dark:bg-zinc-800 rounded mb-3" />
                <div className="h-7 bg-zinc-100 dark:bg-zinc-800 rounded-lg" />
              </div>
            ))
          : products!.map((p) => (
              <div
                key={p.asin}
                className="flex flex-col rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3"
              >
                <div className="relative mb-2.5">
                  {p.imageUrl ? (
                    <img
                      src={p.imageUrl}
                      alt={p.title}
                      className="w-full h-28 object-contain rounded-lg bg-stone-50 dark:bg-zinc-800"
                    />
                  ) : (
                    <div className="w-full h-28 rounded-lg bg-stone-50 dark:bg-zinc-800" />
                  )}
                  <span className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-full bg-white/90 dark:bg-zinc-900/90 text-[10px] font-medium text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                    {p.category}
                  </span>
                </div>
                <h4 className="text-xs font-medium text-zinc-900 dark:text-zinc-100 line-clamp-2 mb-1">
                  {p.title}
                </h4>
                <div className="flex items-center gap-2 mb-2.5 mt-auto">
                  <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    {p.price}
                  </span>
                  {p.rating > 0 && (
                    <span className="flex items-center gap-0.5 text-[11px] text-zinc-500">
                      <Star size={11} className="fill-amber-400 text-amber-400" />
                      {p.rating.toFixed(1)}
                    </span>
                  )}
                </div>
                <a
                  href={outboundHref(p.affiliateUrl)}
                  target="_blank"
                  rel="nofollow sponsored noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 w-full py-2 px-3 bg-orange-700 hover:bg-orange-800 text-white text-xs font-medium rounded-lg transition-colors"
                >
                  Buy on Amazon
                  <ExternalLink size={12} />
                </a>
              </div>
            ))}
      </div>
    </div>
  );
}
