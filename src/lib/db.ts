import { sql } from "@vercel/postgres";

export async function findUserByGoogleId(googleId: string) {
  const { rows } = await sql`
    SELECT * FROM users WHERE google_id = ${googleId} LIMIT 1
  `;
  return rows[0] || null;
}

export async function createUser(googleId: string, email: string, name: string, avatarUrl: string) {
  const { rows } = await sql`
    INSERT INTO users (google_id, email, name, avatar_url)
    VALUES (${googleId}, ${email}, ${name}, ${avatarUrl})
    ON CONFLICT (google_id) DO UPDATE SET name = ${name}, avatar_url = ${avatarUrl}
    RETURNING *
  `;
  return rows[0];
}

export async function getUserCredits(userId: string): Promise<number> {
  const { rows } = await sql`SELECT credits FROM users WHERE id = ${userId}`;
  return rows[0]?.credits ?? 0;
}

export async function deductCredit(userId: string) {
  await sql`UPDATE users SET credits = credits - 1 WHERE id = ${userId} AND credits > 0`;
}

export async function addCredits(userId: string, amount: number) {
  await sql`UPDATE users SET credits = credits + ${amount} WHERE id = ${userId}`;
}

// preview_image_url was added in code without a migration; self-init it so
// inserts don't 500 on databases that predate the column.
let designColumnsReady = false;
async function ensureDesignColumns() {
  if (designColumnsReady) return;
  await sql`ALTER TABLE designs ADD COLUMN IF NOT EXISTS preview_image_url TEXT`;
  designColumnsReady = true;
}

export async function saveDesign(params: {
  mode: string;
  eventConfig: unknown;
  roomAnalysis: unknown;
  products: unknown;
  hotspots: unknown;
  designNarrative: string;
  originalImageUrl: string;
  generatedImageUrl: string;
  userId?: string | null;
  isUnlocked?: boolean;
  selectedItems?: unknown;
  originalBlur?: string | null;
  generatedBlur?: string | null;
  // Watermarked, downscaled preview served to non-entitled viewers (paywall).
  previewImageUrl?: string | null;
}) {
  await ensureDesignColumns();
  const { rows } = await sql`
    INSERT INTO designs (mode, event_config, room_analysis, products, hotspots, design_narrative, original_image_url, generated_image_url, preview_image_url, user_id, is_unlocked, selected_items, original_blur, generated_blur)
    VALUES (
      ${params.mode},
      ${JSON.stringify(params.eventConfig)},
      ${JSON.stringify(params.roomAnalysis)},
      ${JSON.stringify(params.products)},
      ${JSON.stringify(params.hotspots)},
      ${params.designNarrative},
      ${params.originalImageUrl},
      ${params.generatedImageUrl},
      ${params.previewImageUrl ?? null},
      ${params.userId ?? null},
      ${params.isUnlocked ?? false},
      ${JSON.stringify(params.selectedItems ?? null)},
      ${params.originalBlur ?? null},
      ${params.generatedBlur ?? null}
    )
    RETURNING id
  `;
  return rows[0].id as string;
}

export async function getDesign(designId: string) {
  const { rows } = await sql`SELECT * FROM designs WHERE id = ${designId} LIMIT 1`;
  return rows[0] || null;
}

export async function setHotspots(designId: string, hotspots: unknown) {
  await sql`
    UPDATE designs SET hotspots = ${JSON.stringify(hotspots)} WHERE id = ${designId}
  `;
}

// ─── Gallery ───
export async function requestGalleryPublish(designId: string, userId: string) {
  const { rowCount } = await sql`
    UPDATE designs SET gallery_status = 'pending'
    WHERE id = ${designId} AND user_id = ${userId}
      AND gallery_status IN ('none', 'rejected')
  `;
  return (rowCount ?? 0) > 0;
}

export async function setGalleryStatus(designId: string, status: string) {
  const publishedAt = status === "approved" ? "now()" : null;
  if (status === "approved") {
    await sql`UPDATE designs SET gallery_status = 'approved', published_at = now() WHERE id = ${designId}`;
  } else {
    await sql`UPDATE designs SET gallery_status = ${status} WHERE id = ${designId}`;
  }
  return publishedAt;
}

export async function getPendingDesigns() {
  const { rows } = await sql`
    SELECT id, mode, event_config, room_analysis, products, design_narrative,
           original_image_url, generated_image_url, created_at
    FROM designs WHERE gallery_status = 'pending'
    ORDER BY created_at ASC
  `;
  return rows;
}

export async function getGalleryDesigns(opts: {
  mode?: string;
  sort?: string;
  limit?: number;
}) {
  const { mode, sort, limit = 60 } = opts;
  const orderBy =
    sort === "newest"
      ? "published_at DESC NULLS LAST"
      : "like_count DESC, published_at DESC NULLS LAST";
  // Build with explicit branches to keep the tagged-template safe
  if (mode === "space" || mode === "event") {
    const { rows } = await sql.query(
      `SELECT id, mode, event_config, room_analysis, design_narrative, products,
              original_image_url, generated_image_url, like_count, published_at
       FROM designs WHERE gallery_status = 'approved' AND mode = $1
       ORDER BY ${orderBy} LIMIT $2`,
      [mode, limit]
    );
    return rows;
  }
  const { rows } = await sql.query(
    `SELECT id, mode, event_config, room_analysis, design_narrative, products,
            original_image_url, generated_image_url, like_count, published_at
     FROM designs WHERE gallery_status = 'approved'
     ORDER BY ${orderBy} LIMIT $1`,
    [limit]
  );
  return rows;
}

// Lightweight gallery cards — excludes the heavy base64 image columns.
// Returns Blob image URLs + blur placeholders; rendered via next/image.
export async function getGalleryCards(opts: {
  mode?: string;
  sort?: string;
  limit?: number;
}) {
  const { mode, sort, limit = 60 } = opts;
  const orderBy =
    sort === "newest"
      ? "published_at DESC NULLS LAST"
      : "like_count DESC, published_at DESC NULLS LAST";
  // Card grid + search/facets never use `hotspots` (often a large JSON blob),
  // so it's excluded from the gallery payload (P1-a).
  const cols = `id, mode, event_config, room_analysis, design_narrative, selected_items, products, like_count, published_at, original_image_url, generated_image_url, original_blur, generated_blur`;
  if (mode === "space" || mode === "event") {
    const { rows } = await sql.query(
      `SELECT ${cols} FROM designs WHERE gallery_status = 'approved' AND mode = $1
       ORDER BY ${orderBy} LIMIT $2`,
      [mode, limit]
    );
    return rows;
  }
  const { rows } = await sql.query(
    `SELECT ${cols} FROM designs WHERE gallery_status = 'approved'
     ORDER BY ${orderBy} LIMIT $1`,
    [limit]
  );
  return rows;
}

export async function getApprovedDesignIds() {
  const { rows } = await sql`
    SELECT id, published_at FROM designs WHERE gallery_status = 'approved'
  `;
  return rows as { id: string; published_at: string }[];
}

export async function toggleLike(designId: string, fingerprint: string) {
  const existing = await sql`
    SELECT id FROM design_likes WHERE design_id = ${designId} AND fingerprint = ${fingerprint} LIMIT 1
  `;
  let liked: boolean;
  if (existing.rows.length > 0) {
    await sql`DELETE FROM design_likes WHERE design_id = ${designId} AND fingerprint = ${fingerprint}`;
    liked = false;
  } else {
    await sql`INSERT INTO design_likes (design_id, fingerprint) VALUES (${designId}, ${fingerprint}) ON CONFLICT DO NOTHING`;
    liked = true;
  }
  const { rows } = await sql`
    UPDATE designs SET like_count = (
      SELECT COUNT(*) FROM design_likes WHERE design_id = ${designId}
    ) WHERE id = ${designId} RETURNING like_count
  `;
  return { liked, likeCount: rows[0]?.like_count ?? 0 };
}

export async function hasLiked(designId: string, fingerprint: string) {
  const { rows } = await sql`
    SELECT 1 FROM design_likes WHERE design_id = ${designId} AND fingerprint = ${fingerprint} LIMIT 1
  `;
  return rows.length > 0;
}

/**
 * Unlock a design for a user. Ownership‑guarded: only succeeds when the design
 * is unowned (anonymous) or already belongs to this user — a caller can never
 * claim/reassign another account's design. Returns true if a row was updated.
 */
export async function unlockDesign(designId: string, userId: string): Promise<boolean> {
  const { rowCount } = await sql`
    UPDATE designs SET is_unlocked = true, user_id = ${userId}
    WHERE id = ${designId} AND (user_id IS NULL OR user_id = ${userId})
  `;
  return (rowCount ?? 0) > 0;
}

export async function getUserDesigns(userId: string) {
  const { rows } = await sql`
    SELECT id, mode, event_config, design_narrative, generated_image_url, generated_blur, is_unlocked, created_at
    FROM designs WHERE user_id = ${userId}
    ORDER BY created_at DESC
  `;
  return rows;
}

export async function saveEventDate(params: {
  userId: string;
  eventType: string;
  eventLabel: string;
  eventDate: string;
  honoree?: string;
}) {
  await sql`
    INSERT INTO event_dates (user_id, event_type, event_label, event_date, honoree)
    VALUES (${params.userId}, ${params.eventType}, ${params.eventLabel}, ${params.eventDate}, ${params.honoree || null})
  `;
}

export async function getUserEventDates(userId: string) {
  const { rows } = await sql`
    SELECT * FROM event_dates WHERE user_id = ${userId} ORDER BY event_date ASC
  `;
  return rows;
}

/** Returns upcoming events (within daysAhead days) with the user's email/name for reminder emails. */
export async function getUpcomingEventReminders(daysAhead: number) {
  const { rows } = await sql`
    SELECT
      ed.id, ed.event_type, ed.event_label, ed.event_date, ed.honoree,
      u.email, u.name
    FROM event_dates ed
    JOIN users u ON u.id = ed.user_id
    WHERE ed.event_date >= CURRENT_DATE
      AND ed.event_date <= CURRENT_DATE + (${daysAhead} || ' days')::interval
    ORDER BY ed.event_date ASC
  `;
  return rows as {
    id: string;
    event_type: string;
    event_label: string;
    event_date: string;
    honoree: string | null;
    email: string;
    name: string | null;
  }[];
}

/** Analytics: aggregate stats for the admin dashboard. */
export async function getAnalyticsStats() {
  await ensurePaymentsColumns();
  const [totals, funnel, revenue, revenueByCurrency, roomTypes, signups] = await Promise.all([
    sql`
      SELECT
        COUNT(*) AS total_designs,
        COUNT(*) FILTER (WHERE mode = 'space') AS space_designs,
        COUNT(*) FILTER (WHERE mode = 'event') AS event_designs,
        COUNT(*) FILTER (WHERE is_unlocked = true) AS unlocked_designs,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') AS designs_7d,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') AS designs_30d
      FROM designs
    `,
    sql`
      SELECT
        COUNT(*) FILTER (WHERE gallery_status = 'pending') AS pending,
        COUNT(*) FILTER (WHERE gallery_status = 'approved') AS approved,
        COUNT(*) FILTER (WHERE gallery_status = 'rejected') AS rejected,
        COALESCE(SUM(like_count), 0) AS total_likes
      FROM designs
    `,
    sql`
      SELECT
        COALESCE(SUM(amount_paise) FILTER (WHERE status = 'completed'), 0) AS total_paise,
        COUNT(*) FILTER (WHERE status = 'completed') AS paid_count,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days' AND status = 'completed') AS paid_30d
      FROM payments
    `,
    sql`
      SELECT
        COALESCE(currency, 'inr') AS currency,
        COALESCE(SUM(amount_paise), 0) AS total,
        COUNT(*) AS cnt
      FROM payments
      WHERE status = 'completed'
      GROUP BY COALESCE(currency, 'inr')
      ORDER BY total DESC
    `,
    sql`
      SELECT
        room_analysis->>'roomType' AS room_type,
        COUNT(*) AS cnt
      FROM designs
      WHERE room_analysis->>'roomType' IS NOT NULL
      GROUP BY room_type
      ORDER BY cnt DESC
      LIMIT 8
    `,
    sql`
      SELECT
        COUNT(*) AS total_users,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') AS users_7d,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') AS users_30d
      FROM users
    `,
  ]);

  return {
    totals: totals.rows[0],
    funnel: funnel.rows[0],
    revenue: revenue.rows[0],
    revenueByCurrency: revenueByCurrency.rows,
    roomTypes: roomTypes.rows,
    signups: signups.rows[0],
  };
}

// Stripe payments need a currency + a unique key for idempotent recording.
let paymentsColumnsReady = false;
async function ensurePaymentsColumns() {
  if (paymentsColumnsReady) return;
  await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS currency TEXT`;
  await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS stripe_session_id TEXT`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_stripe_session ON payments(stripe_session_id)`;
  paymentsColumnsReady = true;
}

/** Per-user report for the admin table: counts, spend, activity. */
export async function getUserReport() {
  await ensurePaymentsColumns();
  const { rows } = await sql`
    SELECT
      u.id,
      u.name,
      u.email,
      u.created_at,
      (SELECT COUNT(*) FROM designs d WHERE d.user_id = u.id) AS designs,
      (SELECT COUNT(*) FROM designs d WHERE d.user_id = u.id AND d.is_unlocked) AS unlocked,
      (SELECT COALESCE(SUM(amount_paise), 0) FROM payments p
         WHERE p.user_id = u.id AND p.status = 'completed') AS spent,
      (SELECT currency FROM payments p
         WHERE p.user_id = u.id AND p.status = 'completed'
         ORDER BY created_at DESC LIMIT 1) AS currency,
      (SELECT MAX(created_at) FROM designs d WHERE d.user_id = u.id) AS last_active
    FROM users u
    ORDER BY u.created_at DESC
    LIMIT 500
  `;
  return rows;
}

/** Record a completed Stripe sale (idempotent on stripe_session_id). */
export async function recordStripeSale(p: {
  userId: string;
  designId: string;
  amount: number; // smallest currency unit (cents / paise)
  currency: string;
  stripeSessionId: string;
}) {
  await ensurePaymentsColumns();
  await sql`
    INSERT INTO payments (user_id, design_id, amount_paise, currency, status, stripe_session_id)
    VALUES (${p.userId}, ${p.designId}, ${p.amount}, ${p.currency}, 'completed', ${p.stripeSessionId})
    ON CONFLICT (stripe_session_id) DO NOTHING
  `;
}

export async function createPayment(userId: string, designId: string, amountPaise: number) {
  const { rows } = await sql`
    INSERT INTO payments (user_id, design_id, amount_paise)
    VALUES (${userId}, ${designId}, ${amountPaise})
    RETURNING id
  `;
  return rows[0].id as string;
}

export async function completePayment(paymentId: string, instamojoPaymentId: string) {
  await sql`
    UPDATE payments SET status = 'completed', instamojo_payment_id = ${instamojoPaymentId}
    WHERE id = ${paymentId}
  `;
}

export async function getPayment(paymentId: string) {
  const { rows } = await sql`SELECT * FROM payments WHERE id = ${paymentId} LIMIT 1`;
  return rows[0] || null;
}

// ─── Billing: pricing + coupons ───
// Amounts are stored in the smallest currency unit (paise / cents), matching
// Stripe. Schema for the pricing/coupons/checkout_intents tables (and the
// restyled_from column) lives in scripts/migrate.mjs — run `npm run db:migrate`
// at deploy. These tables are assumed to exist here (no per-request DDL).

export interface PricingRow {
  locale: string;
  actual_amount: number;
  sale_amount: number;
  currency: string;
}

export async function getPricing(locale: string): Promise<PricingRow | null> {
  const { rows } = await sql`SELECT * FROM pricing WHERE locale = ${locale} LIMIT 1`;
  return (rows[0] as PricingRow) || null;
}

export async function getAllPricing(): Promise<PricingRow[]> {
  const { rows } = await sql`SELECT * FROM pricing ORDER BY locale`;
  return rows as PricingRow[];
}

export async function updatePricing(
  locale: string,
  actualAmount: number,
  saleAmount: number
) {
  await sql`
    UPDATE pricing SET actual_amount = ${actualAmount}, sale_amount = ${saleAmount}, updated_at = now()
    WHERE locale = ${locale}
  `;
}

export async function listCoupons() {
  const { rows } = await sql`SELECT * FROM coupons ORDER BY created_at DESC`;
  return rows;
}

export async function createCoupon(p: {
  code: string;
  discountType: string;
  discountValue: number;
  locale?: string | null;
  active?: boolean;
  expiresAt?: string | null;
  maxUses?: number | null;
}) {
  await sql`
    INSERT INTO coupons (code, discount_type, discount_value, locale, active, expires_at, max_uses)
    VALUES (
      ${p.code.toUpperCase()},
      ${p.discountType},
      ${p.discountValue},
      ${p.locale || null},
      ${p.active ?? true},
      ${p.expiresAt || null},
      ${p.maxUses ?? null}
    )
    ON CONFLICT (code) DO UPDATE SET
      discount_type = EXCLUDED.discount_type,
      discount_value = EXCLUDED.discount_value,
      locale = EXCLUDED.locale,
      active = EXCLUDED.active,
      expires_at = EXCLUDED.expires_at,
      max_uses = EXCLUDED.max_uses
  `;
}

export async function setCouponActive(id: string, active: boolean) {
  await sql`UPDATE coupons SET active = ${active} WHERE id = ${id}`;
}

export async function deleteCoupon(id: string) {
  await sql`DELETE FROM coupons WHERE id = ${id}`;
}

export async function getCouponByCode(code: string) {
  const { rows } = await sql`SELECT * FROM coupons WHERE code = ${code.toUpperCase()} LIMIT 1`;
  return rows[0] || null;
}

export async function incrementCouponUse(code: string) {
  await sql`UPDATE coupons SET used_count = used_count + 1 WHERE code = ${code.toUpperCase()}`;
}

// ─── Abandoned-checkout funnel ───
export async function recordCheckoutIntent(p: {
  userId: string;
  designId: string;
  email: string;
  name?: string | null;
  amount: number;
  currency: string;
}) {
  await sql`
    INSERT INTO checkout_intents (user_id, design_id, email, name, amount, currency)
    VALUES (${p.userId}, ${p.designId}, ${p.email}, ${p.name || null}, ${p.amount}, ${p.currency})
    ON CONFLICT (user_id, design_id) DO UPDATE SET
      email = EXCLUDED.email,
      name = EXCLUDED.name,
      amount = EXCLUDED.amount,
      currency = EXCLUDED.currency,
      last_reminder_stage = 0,
      created_at = now()
  `;
}

// Intents that are still unpaid and haven't finished the 3-stage funnel.
export async function getDueCheckoutReminders() {
  const { rows } = await sql`
    SELECT
      ci.id, ci.design_id, ci.email, ci.name, ci.amount, ci.currency,
      ci.last_reminder_stage,
      EXTRACT(EPOCH FROM (now() - ci.created_at)) / 86400 AS days_since,
      d.mode, d.generated_image_url, d.design_narrative
    FROM checkout_intents ci
    JOIN designs d ON d.id = ci.design_id
    WHERE ci.last_reminder_stage < 3
      AND d.is_unlocked = false
  `;
  return rows as {
    id: string;
    design_id: string;
    email: string;
    name: string | null;
    amount: number;
    currency: string;
    last_reminder_stage: number;
    days_since: number;
    mode: string;
    generated_image_url: string;
    design_narrative: string | null;
  }[];
}

export async function markCheckoutReminderSent(id: string, stage: number) {
  await sql`UPDATE checkout_intents SET last_reminder_stage = ${stage} WHERE id = ${id}`;
}

// ─── Restyle lineage (save-as-new) ───
// The restyled_from column is created by scripts/migrate.mjs.

/** Number of restyles already created from a given root design. */
export async function countRestyles(rootId: string): Promise<number> {
  const { rows } = await sql`
    SELECT COUNT(*)::int AS n FROM designs WHERE restyled_from = ${rootId}
  `;
  return rows[0]?.n ?? 0;
}

export async function setRestyledFrom(designId: string, rootId: string) {
  await sql`UPDATE designs SET restyled_from = ${rootId} WHERE id = ${designId}`;
}
