"use client";

import { X, ExternalLink, Star, EyeOff } from "lucide-react";
import type { ProductResult } from "@/lib/types";
import { outboundHref } from "@/lib/outbound";

interface ProductCardProps {
  product: ProductResult;
  onClose: () => void;
  onHide?: () => void;
  variant?: "popup" | "sheet";
  hidePrices?: boolean;
}

export default function ProductCard({
  product,
  onClose,
  onHide,
  variant = "popup",
  hidePrices = false,
}: ProductCardProps) {
  const { recommendation, amazonProduct } = product;

  const isSheet = variant === "sheet";

  return (
    <div
      role="dialog"
      aria-label={amazonProduct?.title || recommendation.category}
      className={`relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 ${
        isSheet
          ? "rounded-t-xl p-4 w-full shadow-xl"
          : "rounded-xl p-3 w-64 sm:w-72 shadow-md"
      }`}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
      >
        <X size={14} />
      </button>

      {amazonProduct ? (
        <div className={isSheet ? "flex gap-4" : ""}>
          {amazonProduct.imageUrl && (
            <img
              src={amazonProduct.imageUrl}
              alt={amazonProduct.title}
              className={`object-contain rounded-lg bg-stone-50 dark:bg-zinc-800 ${
                isSheet ? "w-24 h-24 shrink-0" : "w-full h-32 mb-2.5"
              }`}
            />
          )}
          <div className="flex-1 min-w-0">
            <h3 className={`font-medium text-zinc-900 dark:text-zinc-100 pr-6 ${
              isSheet ? "text-sm line-clamp-2" : "text-xs line-clamp-2 mb-0.5"
            }`}>
              {amazonProduct.title}
            </h3>
            <div className="flex items-center gap-2 mb-1.5 mt-1">
              {!hidePrices && (
                <p className={`font-semibold text-zinc-900 dark:text-zinc-50 ${
                  isSheet ? "text-base" : "text-sm"
                }`}>
                  {amazonProduct.price}
                </p>
              )}
              {amazonProduct.rating > 0 && (
                <span className="flex items-center gap-0.5 text-[11px] text-zinc-500">
                  <Star size={11} className="fill-amber-400 text-amber-400" />
                  {amazonProduct.rating.toFixed(1)}
                </span>
              )}
            </div>
            <p className="text-[11px] text-zinc-500 line-clamp-2 leading-relaxed mb-2.5">
              {recommendation.reason}
            </p>
            <div className={isSheet ? "flex items-center gap-2" : ""}>
              <a
                href={outboundHref(amazonProduct.affiliateUrl)}
                target="_blank"
                rel="nofollow sponsored noopener noreferrer"
                className={`flex items-center justify-center gap-1.5 bg-orange-700 hover:bg-orange-800 text-white font-medium rounded-lg transition-colors text-sm ${
                  isSheet ? "px-5 py-2.5" : "w-full py-2 px-3"
                }`}
              >
                {hidePrices ? "View on Amazon" : "Buy on Amazon"}
                <ExternalLink size={13} />
              </a>
              {onHide && isSheet && (
                <button
                  onClick={onHide}
                  className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors shrink-0"
                >
                  <EyeOff size={12} />
                  Hide
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <>
          <h3 className="font-medium text-sm text-zinc-900 dark:text-zinc-100 mb-1 pr-6">
            {recommendation.category}
          </h3>
          <p className="text-xs text-zinc-500 mb-2 leading-relaxed">
            {recommendation.reason}
          </p>
          <p className="text-xs text-zinc-400 italic">
            No exact match found on Amazon
          </p>
        </>
      )}
      {onHide && !isSheet && (
        <button
          onClick={onHide}
          className="flex items-center justify-center gap-1.5 w-full py-1.5 text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors mt-1.5"
        >
          <EyeOff size={11} />
          Hide from design
        </button>
      )}
    </div>
  );
}
