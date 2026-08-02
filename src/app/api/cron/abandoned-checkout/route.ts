import { NextResponse } from "next/server";
import { getDueCheckoutReminders, markCheckoutReminderSent } from "@/lib/db";
import { sendAbandonedCheckoutEmail } from "@/lib/email";
import { assertCron } from "@/lib/cron";

// Daily cron — protected by CRON_SECRET. Sends staged reminders to users who
// started checkout but never paid: day 1, day 3, then a final at day 4.
export const runtime = "nodejs";

// Next stage → minimum days since checkout was started.
const STAGE_THRESHOLD: Record<number, number> = { 1: 1, 2: 3, 3: 4 };

export async function GET(request: Request) {
  const denied = assertCron(request);
  if (denied) return denied;

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  try {
    const due = await getDueCheckoutReminders();

    for (const intent of due) {
      const days = Math.floor(intent.days_since);
      const nextStage = (intent.last_reminder_stage + 1) as 1 | 2 | 3;
      if (nextStage > 3) continue;
      if (days < STAGE_THRESHOLD[nextStage]) continue;

      const result = await sendAbandonedCheckoutEmail({
        to: intent.email,
        name: intent.name ?? undefined,
        designId: intent.design_id,
        generatedImageUrl: intent.generated_image_url,
        designNarrative: intent.design_narrative,
        amount: intent.amount,
        currency: intent.currency,
        stage: nextStage,
        // Previously selected but never passed, so an abandoned *event* design
        // was told to finish its "room redesign".
        mode: intent.mode,
      });

      if (result.ok) {
        await markCheckoutReminderSent(intent.id, nextStage);
        sent++;
      } else if (result.suppressed) {
        // Opted out — retire the stage so this isn't retried every night.
        await markCheckoutReminderSent(intent.id, 3);
        skipped++;
      } else {
        failed++;
      }
    }

    console.log(
      `[cron/abandoned-checkout] sent=${sent} failed=${failed} skipped=${skipped}`
    );
    return NextResponse.json({ sent, failed, skipped });
  } catch (err) {
    console.error("[cron/abandoned-checkout] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
