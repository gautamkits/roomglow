import { NextResponse } from "next/server";
import {
  getActivationCandidates,
  claimActivationEmail,
  releaseActivationEmail,
} from "@/lib/db";
import { sendActivationEmail } from "@/lib/email";
import { assertCron } from "@/lib/cron";

// Daily cron. Nudges users who created an account but never made a design.
//
// The funnel stops itself: getActivationCandidates excludes anyone who has a
// design, so the moment a user creates one they stop matching and no further
// stage is sent. There is no separate cancellation step to get wrong.
export const runtime = "nodejs";

// Next stage → minimum days since signup.
const STAGE_THRESHOLD: Record<number, number> = { 1: 1, 2: 3, 3: 7 };
const MAX_STAGE = 3;

// Only consider recent signups, so the first run after deploy nudges people who
// are actually still deciding rather than blasting the entire back catalogue.
const WINDOW_DAYS = 30;

export async function GET(request: Request) {
  const denied = assertCron(request);
  if (denied) return denied;

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  try {
    const candidates = await getActivationCandidates(WINDOW_DAYS);

    for (const user of candidates) {
      const nextStage = user.last_stage + 1;
      if (nextStage > MAX_STAGE) continue;
      if (user.days_since < STAGE_THRESHOLD[nextStage]) continue;

      // Claim before sending so a concurrent or retried run can't double-mail.
      if (!(await claimActivationEmail(user.id, nextStage))) {
        skipped++;
        continue;
      }

      const result = await sendActivationEmail({
        to: user.email,
        name: user.name,
        stage: nextStage as 1 | 2 | 3,
      });

      if (result.ok) {
        sent++;
      } else if (result.suppressed) {
        // Opted out — keep the claim so we never revisit this stage.
        skipped++;
      } else {
        // Genuine send failure: release the claim so tomorrow can retry.
        await releaseActivationEmail(user.id, nextStage);
        failed++;
      }
    }

    console.log(
      `[cron/activation] candidates=${candidates.length} sent=${sent} failed=${failed} skipped=${skipped}`
    );
    return NextResponse.json({ sent, failed, skipped });
  } catch (err) {
    console.error("[cron/activation] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
