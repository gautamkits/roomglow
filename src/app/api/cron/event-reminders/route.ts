import { NextResponse } from "next/server";
import {
  getUpcomingEventReminders,
  claimEventReminder,
  releaseEventReminder,
} from "@/lib/db";
import { sendEventReminderEmail } from "@/lib/email";
import { assertCron } from "@/lib/cron";

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

    console.log(
      `[cron/event-reminders] sent=${sent} failed=${failed} skipped=${skipped}`
    );
    return NextResponse.json({ sent, failed, skipped });
  } catch (err) {
    console.error("[cron/event-reminders] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
