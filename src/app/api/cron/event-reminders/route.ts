import { NextResponse } from "next/server";
import { getUpcomingEventReminders } from "@/lib/db";
import { sendEventReminderEmail } from "@/lib/email";

// Called daily by Vercel Cron — protected by CRON_SECRET.
export const runtime = "nodejs";

const REMINDER_DAYS = [7, 3, 1, 0]; // send reminders at these thresholds

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sent: string[] = [];
  const failed: string[] = [];

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

      const result = await sendEventReminderEmail({
        to: event.email,
        name: event.name ?? undefined,
        eventLabel: event.event_label,
        eventDate: event.event_date,
        honoree: event.honoree,
        daysUntil,
      });

      if (result.ok) {
        sent.push(`${event.email}:${event.event_label}:${daysUntil}d`);
      } else {
        failed.push(`${event.email}:${event.event_label}`);
      }
    }

    console.log(`[cron/event-reminders] sent=${sent.length} failed=${failed.length}`);
    return NextResponse.json({ sent: sent.length, failed: failed.length });
  } catch (err) {
    console.error("[cron/event-reminders] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
