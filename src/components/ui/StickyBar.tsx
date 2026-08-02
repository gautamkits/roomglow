"use client";

import type { ReactNode } from "react";

/**
 * Sticky bottom action bar. The create flow previously had no sticky CTA at
 * all, so on a phone the primary action was always below the fold.
 *
 * `env(safe-area-inset-bottom)` matters specifically for the Instagram in-app
 * browser, whose bottom chrome overlaps page content; it only resolves to a
 * non-zero value because layout.tsx now sets `viewportFit: "cover"`.
 */
export default function StickyBar({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      // The negative inset must match the create card's own padding (p-4 /
      // sm:p-6) so the bar spans exactly the card width — -mx-5 overhung it by
      // 4px at each edge, which the card's overflow-hidden quietly clipped.
      className={`sticky bottom-0 z-30 -mx-4 sm:-mx-6 px-4 sm:px-6 pt-3 bg-stone-50/95 dark:bg-zinc-950/95 backdrop-blur-sm border-t border-zinc-200 dark:border-zinc-800 ${className}`}
      style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}
    >
      {children}
    </div>
  );
}
