import { NextResponse } from "next/server";
import {
  getUpcomingEventReminders,
  claimEventReminder,
  releaseEventReminder,
} from "@/lib/db";
import { sendEventReminderEmail } from "@/lib/email";
import { assertCron } from "@/lib/cron";
import { runFestivalCampaign } from "@/lib/festivalCampaign";
import { backfillUserLocales } from "@/lib/db";
import { EVENTS } from "@/lib/events";

// Called daily by Vercel Cron — protected by CRON_SECRET.
export const runtime = "nodejs";

const REMINDER_DAYS = [7, 3, 1, 0]; // send reminders at these thresholds

export async function GET(request: Request) {
  const denied = assertCron(request);
  if (denied) return denied;

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  try {
    // Fetch all upcoming events within 7 days
    const events = await getUpcomingEventReminders(7);

    for (const event of events) {
      const eventDate = new Date(event.event_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const daysUntil = Math.round(
        (eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (!REMINDER_DAYS.includes(daysUntil)) continue;

      // Claim before sending. This funnel previously had no sent-log at all, so
      // any manual re-run or Vercel retry re-sent every reminder.
      if (!(await claimEventReminder(event.id, event.event_date, daysUntil))) {
        skipped++;
        continue;
      }

      const result = await sendEventReminderEmail({
        to: event.email,
        name: event.name ?? undefined,
        eventLabel: event.event_label,
        eventDate: event.event_date,
        honoree: event.honoree,
        daysUntil,
      });

      if (result.ok) {
        sent++;
      } else if (result.suppressed) {
        // Opted out — keep the claim so this occurrence is never retried.
        skipped++;
      } else {
        await releaseEventReminder(event.id, event.event_date, daysUntil);
        failed++;
      }
    }

    // The broadcast festival campaign rides on this cron rather than getting
    // its own vercel.json entry: the project is on the Hobby plan, which caps
    // cron jobs at 2, and exceeding that is what stopped ALL of them running.
    const inOnly = EVENTS.filter(
      (e) => e.markets.length === 1 && e.markets[0] === "IN"
    ).map((e) => e.id);
    const usOnly = EVENTS.filter(
      (e) => e.markets.length === 1 && e.markets[0] === "US"
    ).map((e) => e.id);
    // Idempotent: only ever fills a NULL locale, so it is safe to re-run daily
    // and it picks up users who signed up since the last run.
    const backfill = await backfillUserLocales(inOnly, usOnly);
    const festival = await runFestivalCampaign();

    console.log(
      `[cron/event-reminders] reminders sent=${sent} failed=${failed} skipped=${skipped} | ` +
        `festival sent=${festival.sent} failed=${festival.failed} skipped=${festival.skipped} ` +
        `festivals=[${festival.festivals.join(", ")}] | ` +
        `locale backfill byPayment=${backfill.byPayment} byDesign=${backfill.byDesign} byMarketplace=${backfill.byMarketplace} unknown=${backfill.unknown}`
    );
    return NextResponse.json({ sent, failed, skipped, festival, backfill });
  } catch (err) {
    console.error("[cron/event-reminders] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
