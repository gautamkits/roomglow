import { EVENTS } from "@/lib/events";
import {
  getFestivalRecipients,
  claimFestivalSend,
  releaseFestivalSend,
  getFestivalInspiration,
} from "@/lib/db";
import { sendFestivalCampaignEmail } from "@/lib/email";

/**
 * Broadcast festival campaign — "15 August is coming, design your space".
 *
 * Deliberately separate from the saved-event reminder: that one is personal
 * (your kid's birthday, a date the user typed in), this one is the shared
 * calendar and goes to a whole market.
 *
 * TWO HARD RULES, both of which exist to avoid selling something that cannot
 * be delivered:
 *
 * 1. Nothing is ever sent inside MIN_DAYS_BEFORE. The product being promoted
 *    ends in a physical Amazon delivery, so a "2 days to go!" email drives an
 *    order that arrives after the festival. That is a refund and a bad review,
 *    not a sale. 5 days is already tight for standard Indian delivery, which
 *    is why the 5-day mail is explicitly framed as the LAST order window.
 *
 * 2. Only festivals whose date is genuinely fixed. `season` on most events is
 *    a *representative* date used to show/hide the event in the picker, and
 *    the movable ones (Diwali, Holi, Eid, Janmashtami, Ganesh Chaturthi,
 *    Navratri, Dussehra, Easter, Thanksgiving) are placeholders that can be
 *    weeks off. Counting down to a wrong date is worse than not mailing.
 *    Adding those needs a real per-year date table, not this list.
 */
const THRESHOLDS = [20, 10, 5] as const;
export const MIN_DAYS_BEFORE = 5;

/**
 * Real dates for the movable festivals, per year.
 *
 * This is the "real per-year date table" the rule below asks for. `season` in
 * events.ts is a REPRESENTATIVE date used only to show or hide an event in the
 * picker — for Ganesh Chaturthi it says 5 Sept while the 2026 festival is
 * actually 14 Sept, nine days out. Counting down to that would have told people
 * the festival was a week away when they still had a fortnight, and worse, an
 * order placed on a wrong "last chance" date arrives after the event.
 *
 * Rules for maintaining this:
 * - Only add dates you have actually verified for that year.
 * - A movable festival with no entry for the year is SKIPPED, never fallen
 *   back to the events.ts placeholder. Silence beats a wrong countdown.
 */
const MOVABLE_DATES: Record<string, string[]> = {
  ganesh_chaturthi: ["2026-09-14"],
  navratri: ["2026-10-11"],
  dussehra: ["2026-10-20"],
  diwali: ["2026-11-08"],
};

/** The dated occurrence of a movable festival on/after `now`, if we know it. */
function movableOccurrence(eventId: string, now: Date): Date | null {
  const dates = MOVABLE_DATES[eventId];
  if (!dates) return null;
  for (const iso of dates) {
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    if (daysUntil(dt, now) >= 0) return dt;
  }
  return null; // table has run out — skip rather than guess
}

/** Festivals that fall on the same calendar date every year. */
const FIXED_DATE_FESTIVALS = new Set([
  "makar_sankranti", // 14 Jan
  "republic_day", // 26 Jan
  "valentines", // 14 Feb
  "independence_day", // 4 Jul  (US)
  "independence_day_in", // 15 Aug (IN)
  "halloween", // 31 Oct
  "christmas", // 25 Dec
  "new_year", // 31 Dec
]);

export interface FestivalCampaignResult {
  sent: number;
  failed: number;
  skipped: number;
  festivals: string[];
}

/** Days from today to a date, both floored to midnight so it never half-counts. */
function daysUntil(target: Date, now: Date): number {
  const a = new Date(now);
  a.setHours(0, 0, 0, 0);
  const b = new Date(target);
  b.setHours(0, 0, 0, 0);
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

/** This year's occurrence, or next year's once it has passed. */
function nextOccurrence(month: number, day: number, now: Date): Date {
  const thisYear = new Date(now.getFullYear(), month - 1, day);
  if (daysUntil(thisYear, now) >= 0) return thisYear;
  return new Date(now.getFullYear() + 1, month - 1, day);
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function runFestivalCampaign(
  now: Date = new Date(),
  dryRun = false
): Promise<FestivalCampaignResult> {
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const festivals: string[] = [];

  for (const ev of EVENTS) {
    if (!ev.season) continue;
    // Fixed-date festivals use their calendar date; movable ones are eligible
    // only when the per-year table actually knows the date for this year.
    const movable = movableOccurrence(ev.id, now);
    const date = movable ?? (FIXED_DATE_FESTIVALS.has(ev.id) ? nextOccurrence(ev.season.month, ev.season.day, now) : null);
    if (!date) continue;
    const days = daysUntil(date, now);

    // Belt and braces: the threshold list already excludes anything under 5,
    // but this is the rule that must never be bypassed by a future edit.
    if (days < MIN_DAYS_BEFORE) continue;
    if (!THRESHOLDS.includes(days as (typeof THRESHOLDS)[number])) continue;

    const occurrence = isoDate(date);
    festivals.push(`${ev.id}@${occurrence}(T-${days})`);

    // Fetched once per festival, not per recipient — same three shots for the
    // whole market, and one query instead of N.
    const inspiration = await getFestivalInspiration(ev.id, 3);

    for (const market of ev.markets) {
      const recipients = await getFestivalRecipients(market);
      for (const user of recipients) {
        if (dryRun) {
          sent++;
          continue;
        }
        // Claim before sending: a Vercel retry or a manual re-run would
        // otherwise re-mail the entire market.
        if (!(await claimFestivalSend(user.id, ev.id, occurrence, days))) {
          skipped++;
          continue;
        }
        const res = await sendFestivalCampaignEmail({
          to: user.email,
          name: user.name,
          eventLabel: ev.label,
          eventDate: occurrence,
          daysBefore: days,
          emoji: ev.icon,
          inspiration,
        });
        if (res.ok) {
          sent++;
        } else if (res.suppressed) {
          // Opted out — keep the claim so it is never retried.
          skipped++;
        } else {
          await releaseFestivalSend(user.id, ev.id, occurrence, days);
          failed++;
        }
      }
    }
  }

  return { sent, failed, skipped, festivals };
}
