import { EVENTS } from "@/lib/events";
import {
  getFestivalRecipients,
  claimFestivalSend,
  releaseFestivalSend,
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
    if (!ev.season || !FIXED_DATE_FESTIVALS.has(ev.id)) continue;

    const date = nextOccurrence(ev.season.month, ev.season.day, now);
    const days = daysUntil(date, now);

    // Belt and braces: the threshold list already excludes anything under 5,
    // but this is the rule that must never be bypassed by a future edit.
    if (days < MIN_DAYS_BEFORE) continue;
    if (!THRESHOLDS.includes(days as (typeof THRESHOLDS)[number])) continue;

    const occurrence = isoDate(date);
    festivals.push(`${ev.id}@${occurrence}(T-${days})`);

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
