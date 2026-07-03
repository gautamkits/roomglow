import { sql } from "@vercel/postgres";
import { getFeatures } from "@/lib/db";

// Early-feedback promo: the first FREE_PROMO_USER_CAP accounts created on or
// after FREE_PROMO_START each get their FIRST design free (auto-unlocked, no
// paywall) in every market. Their later designs — and signup #501 onward — use
// normal pricing. Kill switch: site_features key "first_design_free" (admin).
export const FREE_PROMO_START = "2026-07-03T00:00:00Z";
export const FREE_PROMO_USER_CAP = 500;

/** Signups since the promo started (for the admin "X of 500" counter). */
export async function countPromoSignups(): Promise<number> {
  const { rows } = await sql`
    SELECT COUNT(*)::int AS n FROM users WHERE created_at >= ${FREE_PROMO_START}
  `;
  return rows[0]?.n ?? 0;
}

/**
 * True when this user's NEXT saved design should be unlocked free:
 * flag on + signed up during the promo window within the first 500 promo
 * signups + hasn't got an unlocked design yet. Best-effort: any error returns
 * false so a promo bug can never block the normal (paid) flow.
 */
export async function isFreeFirstDesignEligible(userId: string): Promise<boolean> {
  try {
    const features = await getFeatures();
    if (!features.first_design_free) return false;

    const { rows } = await sql`
      SELECT
        u.created_at >= ${FREE_PROMO_START} AS in_window,
        (SELECT COUNT(*) FROM users u2
          WHERE u2.created_at >= ${FREE_PROMO_START}
            AND u2.created_at <= u.created_at)::int AS promo_rank,
        (SELECT COUNT(*) FROM designs d
          WHERE d.user_id = u.id AND d.is_unlocked)::int AS unlocked_count
      FROM users u WHERE u.id = ${userId}
    `;
    const r = rows[0];
    if (!r) return false;
    return !!r.in_window && r.promo_rank <= FREE_PROMO_USER_CAP && r.unlocked_count === 0;
  } catch (err) {
    console.error("[promo] eligibility check failed (treating as not eligible):", err);
    return false;
  }
}
