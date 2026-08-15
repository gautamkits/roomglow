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
  opts?: { meta?: boolean; server?: boolean }
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
  if (opts?.server) {
    // PostHog and the Pixel are both blocked in the Instagram in-app browser —
    // our main ad channel — so the load-bearing funnel events are additionally
    // posted to our own endpoint, which is not blockable.
    try {
      const body = JSON.stringify({ name, props });
      if (typeof navigator !== "undefined" && navigator.sendBeacon) {
        navigator.sendBeacon(
          "/api/funnel",
          new Blob([body], { type: "application/json" })
        );
      } else {
        void fetch("/api/funnel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        }).catch(() => {});
      }
    } catch {
      /* never let telemetry break the flow */
    }
  }
}

/**
 * Funnel events for the create flow. Kept as a closed union so the step names
 * can't drift — before this, `setStep` was called ~20 times and emitted
 * nothing, so there was no way to tell whether users abandoned at the sign-in
 * wall, during generation, or at the paywall.
 */
export type FunnelEvent =
  | "setup_started"
  | "occasion_selected"
  | "photo_selected"
  | "signin_gate_shown"
  | "signin_gate_returned"
  | "flow_step"
  | "pipeline_failed"
  | "pipeline_timing"
  | "design_completed";

// Events worth paying a server round-trip for.
const SERVER_EVENTS: ReadonlySet<FunnelEvent> = new Set([
  "photo_selected",
  "signin_gate_shown",
  "signin_gate_returned",
  "design_completed",
  "pipeline_failed",
  // The whole point is to measure the Instagram in-app-browser users, where
  // PostHog is blocked — so this one has to take the server round-trip.
  "pipeline_timing",
]);

export function trackFunnel(
  name: FunnelEvent,
  props?: Record<string, unknown>
): void {
  track(name, props, { server: SERVER_EVENTS.has(name) });
}
