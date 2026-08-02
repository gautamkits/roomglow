"use client";

import type { InputHTMLAttributes, ReactNode } from "react";

export const inputClass =
  "w-full px-3.5 min-h-11 py-2.5 rounded-xl text-base sm:text-sm border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 outline-none focus:border-orange-700 transition-colors";

/**
 * Labelled input. Note `text-base` on mobile: iOS Safari (and the Instagram
 * webview) zooms the viewport on focus for any font-size under 16px, which on
 * this flow left users zoomed in with the CTA off-screen.
 */
export default function Field({
  label,
  hint,
  icon,
  className = "",
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  hint?: string;
  icon?: ReactNode;
}) {
  return (
    <label className={`block ${className}`}>
      {label && (
        <span className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">
          {label}
        </span>
      )}
      <span className="relative block">
        {icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none">
            {icon}
          </span>
        )}
        <input {...rest} className={`${inputClass} ${icon ? "pl-9" : ""}`} />
      </span>
      {hint && (
        <span className="block text-[11px] text-zinc-400 mt-1">{hint}</span>
      )}
    </label>
  );
}
