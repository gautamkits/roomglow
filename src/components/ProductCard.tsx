"use client";

import { X, ExternalLink, Star, EyeOff } from "lucide-react";
import type { ProductResult } from "@/lib/types";

interface ProductCardProps {
  product: ProductResult;
  onClose: () => void;
  onHide?: () => void;
}

export default function ProductCard({ product, onClose, onHide }: ProductCardProps) {
  const { recommendation, amazonProduct } = product;

  return (
    <div
      role="dialog"
      aria-label={amazonProduct?.title || recommendation.category}
      className="relative bg-white dark:bg-zinc-900 rounded-xl shadow-md p-4 w-72 border border-zinc-200 dark:border-zinc-700"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute top-2.5 right-2.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
      >
        <X size={16} />
      </button>

      {amazonProduct ? (
        <>
          {amazonProduct.imageUrl && (
            <img
              src={amazonProduct.imageUrl}
              alt={amazonProduct.title}
              className="w-full h-36 object-contain rounded-lg mb-3 bg-stone-50 dark:bg-zinc-800"
            />
          )}
          <h3 className="font-medium text-sm text-zinc-900 dark:text-zinc-100 line-clamp-2 mb-1 pr-4">
            {amazonProduct.title}
          </h3>
          <div className="flex items-center gap-2 mb-2">
            <p className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              {amazonProduct.price}
            </p>
            {amazonProduct.rating > 0 && (
              <span className="flex items-center gap-0.5 text-xs text-zinc-500">
                <Star size={12} className="fill-amber-400 text-amber-400" />
                {amazonProduct.rating.toFixed(1)}
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-500 mb-3 line-clamp-2 leading-relaxed">
            {recommendation.reason}
          </p>
          <a
            href={amazonProduct.affiliateUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 w-full py-2.5 px-4 bg-orange-700 hover:bg-orange-800 text-white font-medium rounded-lg transition-colors text-sm"
          >
            Buy on Amazon
            <ExternalLink size={14} />
          </a>
          {onHide && (
            <button
              onClick={onHide}
              className="flex items-center justify-center gap-1.5 w-full py-2 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors mt-2"
            >
              <EyeOff size={12} />
              Hide from design
            </button>
          )}
        </>
      ) : (
        <>
          <h3 className="font-medium text-sm text-zinc-900 dark:text-zinc-100 mb-1 pr-4">
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
    </div>
  );
}
