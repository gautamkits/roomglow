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
}) {
  const { rows } = await sql`
    INSERT INTO designs (mode, event_config, room_analysis, products, hotspots, design_narrative, original_image_url, generated_image_url, user_id, is_unlocked, selected_items, original_blur, generated_blur)
    VALUES (
      ${params.mode},
      ${JSON.stringify(params.eventConfig)},
      ${JSON.stringify(params.roomAnalysis)},
      ${JSON.stringify(params.products)},
      ${JSON.stringify(params.hotspots)},
      ${params.designNarrative},
      ${params.originalImageUrl},
      ${params.generatedImageUrl},
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

export async function unlockDesign(designId: string, userId: string) {
  await sql`
    UPDATE designs SET is_unlocked = true, user_id = ${userId} WHERE id = ${designId}
  `;
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
  const [totals, funnel, revenue, roomTypes, signups] = await Promise.all([
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
    roomTypes: roomTypes.rows,
    signups: signups.rows[0],
  };
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
// Stripe. Tables self-initialize on first access (no migration runner exists).
let billingSchemaReady = false;
async function ensureBillingSchema() {
  if (billingSchemaReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS pricing (
      locale TEXT PRIMARY KEY,
      actual_amount INTEGER NOT NULL,
      sale_amount INTEGER NOT NULL,
      currency TEXT NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS coupons (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      code TEXT UNIQUE NOT NULL,
      discount_type TEXT NOT NULL,
      discount_value INTEGER NOT NULL,
      locale TEXT,
      active BOOLEAN DEFAULT true,
      expires_at TIMESTAMPTZ,
      max_uses INTEGER,
      used_count INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `;
  // Abandoned-checkout funnel: one row per user+design that started Stripe
  // checkout. last_reminder_stage tracks which reminder (1=day1, 2=day3,
  // 3=final/day4) has been sent. Reminders stop once the design is unlocked.
  await sql`
    CREATE TABLE IF NOT EXISTS checkout_intents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID,
      design_id UUID,
      email TEXT NOT NULL,
      name TEXT,
      amount INTEGER,
      currency TEXT,
      last_reminder_stage INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE(user_id, design_id)
    )
  `;
  // Seed defaults from the current hardcoded prices (no-op once set).
  await sql`INSERT INTO pricing (locale, actual_amount, sale_amount, currency)
            VALUES ('IN', 9900, 9900, 'inr') ON CONFLICT (locale) DO NOTHING`;
  await sql`INSERT INTO pricing (locale, actual_amount, sale_amount, currency)
            VALUES ('US', 499, 499, 'usd') ON CONFLICT (locale) DO NOTHING`;
  billingSchemaReady = true;
}

export interface PricingRow {
  locale: string;
  actual_amount: number;
  sale_amount: number;
  currency: string;
}

export async function getPricing(locale: string): Promise<PricingRow | null> {
  await ensureBillingSchema();
  const { rows } = await sql`SELECT * FROM pricing WHERE locale = ${locale} LIMIT 1`;
  return (rows[0] as PricingRow) || null;
}

export async function getAllPricing(): Promise<PricingRow[]> {
  await ensureBillingSchema();
  const { rows } = await sql`SELECT * FROM pricing ORDER BY locale`;
  return rows as PricingRow[];
}

export async function updatePricing(
  locale: string,
  actualAmount: number,
  saleAmount: number
) {
  await ensureBillingSchema();
  await sql`
    UPDATE pricing SET actual_amount = ${actualAmount}, sale_amount = ${saleAmount}, updated_at = now()
    WHERE locale = ${locale}
  `;
}

export async function listCoupons() {
  await ensureBillingSchema();
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
  await ensureBillingSchema();
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
  await ensureBillingSchema();
  await sql`UPDATE coupons SET active = ${active} WHERE id = ${id}`;
}

export async function deleteCoupon(id: string) {
  await ensureBillingSchema();
  await sql`DELETE FROM coupons WHERE id = ${id}`;
}

export async function getCouponByCode(code: string) {
  await ensureBillingSchema();
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
  await ensureBillingSchema();
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
  await ensureBillingSchema();
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
