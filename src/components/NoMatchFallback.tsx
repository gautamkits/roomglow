"use client";

import { ExternalLink, RefreshCw, Search } from "lucide-react";
import type { ProductResult } from "@/lib/types";
import { outboundHref } from "@/lib/outbound";
import { AMAZON_DOMAINS, getClientLocale } from "@/lib/locale";

/** Amazon search URL for a row that has no specific product. Prefers the tagged
 *  URL built server-side; designs saved before `searchUrl` was stored fall back
 *  to an untagged search on the viewer's marketplace (affiliate tags are
 *  server-only, so a client-built URL can't carry one). */
export function fallbackSearchUrl(product: ProductResult): string | null {
  if (product.searchUrl) return product.searchUrl;
  const q = product.recommendation.searchQuery || product.recommendation.category;
  if (!q) return null;
  return `https://www.${AMAZON_DOMAINS[getClientLocale()]}/s?k=${encodeURIComponent(q)}`;
}

/** Designs saved before status tracking have no matchStatus — those genuinely
 *  had no match, so "no_results" is the safe reading. */
export function matchStatusOf(product: ProductResult) {
  return product.matchStatus ?? "no_results";
}

interface Props {
  product: ProductResult;
  onRetry?: () => void;
  retrying?: boolean;
  compact?: boolean;
}

export default function NoMatchFallback({
  product,
  onRetry,
  retrying = false,
  compact = false,
}: Props) {
  const status = matchStatusOf(product);
  const searchUrl = fallbackSearchUrl(product);
  const isOutage = status === "upstream_error";

  return (
    <div className={compact ? "flex items-center gap-2" : "space-y-2"}>
      {!compact && (
        <p className="text-xs text-zinc-400 italic">
          {isOutage
            ? "Couldn't reach Amazon for this item."
            : "No exact match found on Amazon."}
        </p>
      )}
      <div className="flex items-center gap-2">
        {isOutage && onRetry && (
          <button
            onClick={onRetry}
            disabled={retrying}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-orange-700 hover:bg-orange-800 disabled:opacity-60 text-white text-xs font-medium rounded-md transition-colors"
          >
            <RefreshCw size={11} className={retrying ? "animate-spin" : ""} />
            {retrying ? "Retrying" : "Retry"}
          </button>
        )}
        {searchUrl && (
          <a
            href={outboundHref(searchUrl)}
            target="_blank"
            rel="nofollow sponsored noopener noreferrer"
            className="flex items-center gap-1 px-2.5 py-1.5 border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-xs font-medium rounded-md transition-colors"
          >
            <Search size={11} />
            Search on Amazon
            <ExternalLink size={10} />
          </a>
        )}
      </div>
    </div>
  );
}
