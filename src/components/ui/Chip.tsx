"use client";

/**
 * Selectable chip. Previously a local const inside SetupPanel at `text-xs
 * py-1.5` — roughly 28px tall, well under the 44px touch minimum. `min-h-11`
 * fixes that; `size="sm"` is for dense non-primary rows only (filters, tags),
 * never for a step's main choices.
 */

import type { ReactNode } from "react";

export default function Chip({
  label,
  selected,
  onClick,
  icon,
  size = "md",
  className = "",
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  icon?: ReactNode;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`inline-flex items-center justify-center gap-1.5 border transition-colors outline-none focus-visible:ring-2 focus-visible:ring-orange-700 focus-visible:ring-offset-1 ${
        size === "sm"
          ? "px-3 py-1.5 text-xs rounded-lg"
          : "px-4 min-h-11 py-2.5 text-sm rounded-xl"
      } ${
        selected
          ? "border-orange-700 bg-orange-50 dark:bg-orange-950/30 text-orange-800 dark:text-orange-300 font-medium"
          : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700"
      } ${className}`}
    >
      {icon}
      {label}
    </button>
  );
}
