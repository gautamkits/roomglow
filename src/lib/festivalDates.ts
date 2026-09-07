/**
 * Verified per-year dates for the movable festivals.
 *
 * `season` in events.ts is a REPRESENTATIVE anchor, only ever meant for showing
 * and hiding an event in the picker. For Ganesh Chaturthi it says 5 Sept while
 * the 2026 festival is actually 14 Sept — and because a passed anchor rolls to
 * next year, that nine-day gap made the event vanish from the picker eight days
 * BEFORE the festival, in the middle of its own campaign. This table is the real
 * calendar both the picker and the countdown emails read, so they cannot drift
 * apart again.
 *
 * Rules for maintaining this:
 * - Only add dates you have actually verified for that year.
 * - Keep each list ASCENDING. The lookup scans in order and stops at the first
 *   occurrence that has not finished.
 * - Running out of years is safe but different per caller: the picker falls back
 *   to the events.ts anchor (an approximate date still beats the event
 *   disappearing), while the campaign skips the festival entirely, because
 *   silence beats counting down to a wrong "last chance to order" date.
 *
 * This module deliberately imports nothing: events.ts is pulled into client
 * components, and festivalCampaign.ts already imports events.ts, so anything
 * heavier here would be both a cycle and server code in the browser bundle.
 */
export const FESTIVAL_DATES: Record<string, string[]> = {
  ganesh_chaturthi: ["2026-09-14", "2027-09-04", "2028-08-23"],
  navratri: ["2026-10-11", "2027-09-30", "2028-09-19"],
  dussehra: ["2026-10-20", "2027-10-09", "2028-09-28"],
  diwali: ["2026-11-08", "2027-10-29", "2028-10-17"],
};

/** Local midnight for an ISO date. `new Date("2026-09-14")` parses as UTC and
 *  lands on the 13th in half the world — every comparison here is local. */
export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDays(date: Date, days: number): Date {
  const out = new Date(date);
  out.setDate(out.getDate() + days); // setDate handles month/year overflow
  return out;
}

/**
 * The verified START date of the first occurrence that has not finished yet, or
 * null when the festival has no table entry or the table has run out.
 *
 * `tailDays` is how long the festival runs past its start — Ganesh Chaturthi is
 * ten days, so on day three it is still very much on, and still worth offering.
 * The default of 0 makes this a plain "next occurrence on or after today".
 */
export function verifiedOccurrence(
  eventId: string,
  today: Date,
  tailDays: number = 0
): Date | null {
  const dates = FESTIVAL_DATES[eventId];
  if (!dates) return null;
  for (const iso of dates) {
    const start = parseISODate(iso);
    if (addDays(start, tailDays) >= today) return start;
  }
  return null;
}
