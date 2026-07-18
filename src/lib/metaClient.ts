"use client";

/**
 * Client-side Meta Pixel event helper.
 *
 * Generates an `eventID` and fires the browser Pixel event, then returns that id
 * so the caller can forward it to the matching server-side CAPI call — Meta
 * deduplicates the browser/server pair by shared `eventID`. Standard events use
 * `track`; custom events (DesignCreated) use `trackCustom`.
 */

type Fbq = (
  method: "track" | "trackCustom",
  eventName: string,
  params?: Record<string, unknown>,
  options?: { eventID?: string }
) => void;

const STANDARD = new Set([
  "Purchase",
  "InitiateCheckout",
  "ViewContent",
  "Lead",
  "PageView",
]);

export function trackMeta(
  eventName: string,
  params?: Record<string, unknown>
): string | undefined {
  const eventId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : String(Date.now()) + Math.random().toString(16).slice(2);

  if (typeof window === "undefined") return eventId;
  const fbq = (window as unknown as { fbq?: Fbq }).fbq;
  if (!fbq) return eventId;

  const method = STANDARD.has(eventName) ? "track" : "trackCustom";
  try {
    fbq(method, eventName, params, { eventID: eventId });
  } catch {
    /* pixel not ready — server CAPI still fires */
  }
  return eventId;
}
