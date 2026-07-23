"use client";

/**
 * Tiny client analytics helper.
 *
 * Fires a product event to PostHog (always, when it's initialized) and,
 * opt-in, to the Meta Pixel as a custom conversion event. Use snake_case
 * names for PostHog (`image_uploaded`); the Meta name is derived by
 * PascalCasing (`ImageUploaded`). Both are best-effort and never throw — the
 * Instagram in-app browser blocks both PostHog and the Pixel, so treat these
 * as a relative signal and trust the admin DB for the true count.
 */

import posthog from "posthog-js";
import { trackMeta } from "./metaClient";

function toMetaName(name: string): string {
  return name
    .split(/[_-]/)
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
}

export function track(
  name: string,
  props?: Record<string, unknown>,
  opts?: { meta?: boolean }
): void {
  try {
    if ((posthog as unknown as { __loaded?: boolean }).__loaded) {
      posthog.capture(name, props);
    }
  } catch {
    /* posthog not ready — ignore */
  }
  if (opts?.meta) {
    try {
      trackMeta(toMetaName(name), props);
    } catch {
      /* pixel not ready — ignore */
    }
  }
}
