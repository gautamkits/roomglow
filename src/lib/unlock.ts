import { after } from "next/server";
import { ensureHotspots } from "@/lib/hotspots";

/**
 * Single hook for everything that must happen once a design becomes unlocked /
 * entitled. Call this from EVERY unlock path — payment success & webhooks
 * (Stripe, Razorpay), free markets, the free-first-design promo, and any future
 * entitlement path.
 *
 * Runs in the background (never blocks the response) and never throws. Add
 * future post-unlock side effects here so a new unlock path can't silently drop
 * them — that omission is exactly what left promo designs without shoppable
 * hotspots (see save-design). Idempotent: ensureHotspots no-ops if the design
 * already has hotspots.
 */
export function onDesignUnlocked(designId: string): void {
  after(() => ensureHotspots(designId).catch(() => {}));
}
