"use client";

import { useState } from "react";
import { Check, ArrowRight } from "lucide-react";
import type { SuggestedProduct } from "@/lib/types";

interface ProductSelectionProps {
  products: SuggestedProduct[];
  onComplete: (selected: SuggestedProduct[]) => void;
}

export default function ProductSelection({
  products,
  onComplete,
}: ProductSelectionProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleContinue = () => {
    const selectedProducts = products.filter((p) => selected.has(p.id));
    if (selectedProducts.length > 0) onComplete(selectedProducts);
  };

  return (
    <div className="w-full">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {products.map((product) => {
          const isSelected = selected.has(product.id);
          return (
            <button
              key={product.id}
              onClick={() => toggle(product.id)}
              aria-pressed={isSelected}
              className={`group relative p-4 rounded-xl text-left transition-colors border ${
                isSelected
                  ? "border-orange-700 bg-orange-50 dark:bg-orange-950/30"
                  : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700"
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <span className="text-xl leading-none">{product.icon}</span>
                <span
                  className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${
                    isSelected
                      ? "bg-orange-700 border-orange-700 text-white"
                      : "border-zinc-300 dark:border-zinc-600 text-transparent"
                  }`}
                >
                  <Check size={12} strokeWidth={3} />
                </span>
              </div>
              <p className="font-medium text-sm text-zinc-900 dark:text-zinc-100">
                {product.label}
              </p>
              <p className="text-xs text-zinc-500 mt-1 line-clamp-2 leading-relaxed">
                {product.description}
              </p>
            </button>
          );
        })}
      </div>

      <button
        onClick={handleContinue}
        disabled={selected.size === 0}
        className={`mt-6 w-full py-3 rounded-lg font-medium text-sm transition-colors flex items-center justify-center gap-2 ${
          selected.size > 0
            ? "bg-orange-700 hover:bg-orange-800 text-white"
            : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed"
        }`}
      >
        {selected.size > 0
          ? `Design with ${selected.size} item${selected.size !== 1 ? "s" : ""}`
          : "Select items to continue"}
        {selected.size > 0 && <ArrowRight size={16} />}
      </button>
    </div>
  );
}
