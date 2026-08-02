"use client";

/**
 * The primary action style was copy-pasted into every file in the app. This is
 * the one definition. Sizes are floored at a 44px touch target on `md`/`lg`
 * because most traffic is mobile (Instagram in-app browser).
 */

import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-orange-700 hover:bg-orange-800 active:bg-orange-800 text-white border border-transparent",
  secondary:
    "bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700",
  ghost:
    "bg-transparent text-zinc-500 dark:text-zinc-400 border border-transparent hover:text-zinc-800 dark:hover:text-zinc-200",
};

const SIZES: Record<Size, string> = {
  sm: "text-xs px-3 py-2 rounded-lg gap-1.5",
  md: "text-sm px-5 min-h-11 py-2.5 rounded-xl gap-2",
  lg: "text-base px-6 min-h-13 py-3.5 rounded-xl gap-2 font-semibold",
};

export default function Button({
  variant = "primary",
  size = "md",
  fullWidth = false,
  loading = false,
  leftIcon,
  rightIcon,
  className = "",
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-orange-700 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
        VARIANTS[variant]
      } ${SIZES[size]} ${fullWidth ? "w-full" : ""} ${className}`}
    >
      {loading ? (
        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : (
        leftIcon
      )}
      {children}
      {!loading && rightIcon}
    </button>
  );
}
