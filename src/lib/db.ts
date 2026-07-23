import { sql } from "@vercel/postgres";
import { createHash } from "crypto";
import { isOneTimeEvent } from "@/lib/events";

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

// ─── Passwordless email (magic-link) auth ───
// Lets visitors sign in via a one-time email link instead of Google OAuth —
// critical because Google blocks OAuth inside the Instagram in-app browser (our
// top ad channel). Tokens are stored hashed, single-use, and short-lived.
let magicSchemaReady = false;
async function ensureMagicSchema() {
  if (magicSchemaReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS magic_tokens (
      id BIGSERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      consumed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_magic_tokens_hash ON magic_tokens (token_hash)`;
  magicSchemaReady = true;
}

/** Store a hashed one-time sign-in token for an email. */
export async function createMagicToken(
  email: string,
  tokenHash: string,
  expiresAt: Date
) {
  await ensureMagicSchema();
  await sql`
    INSERT INTO magic_tokens (email, token_hash, expires_at)
    VALUES (${email}, ${tokenHash}, ${expiresAt.toISOString()})
  `;
}

/**
 * Atomically validate + single-use consume a magic token. Returns the email it
 * was issued to, or null if the token is unknown, expired, or already used. The
 * UPDATE…RETURNING makes consumption race-safe (a token can't be redeemed twice).
 */
export async function consumeMagicToken(
  tokenHash: string
): Promise<string | null> {
  await ensureMagicSchema();
  const { rows } = await sql`
    UPDATE magic_tokens
       SET consumed_at = now()
     WHERE token_hash = ${tokenHash}
       AND consumed_at IS NULL
       AND expires_at > now()
     RETURNING email
  `;
  return rows[0]?.email ?? null;
}

/**
 * Resolve (or create) a user by email — the identity anchor for magic-link
 * sign-in. Email-first so a visitor who already has a Google account with this
 * address reuses that same row (no duplicate account). New email-only users are
 * inserted with a NULL google_id.
 */
export async function upsertUserByEmail(email: string, name: string) {
  const existing = await sql`SELECT * FROM users WHERE email = ${email} LIMIT 1`;
  if (existing.rows[0]) return existing.rows[0];
  try {
    const { rows } = await sql`
      INSERT INTO users (email, name, avatar_url)
      VALUES (${email}, ${name}, '')
      RETURNING *
    `;
    return rows[0];
  } catch {
    // Fallback for schemas where google_id is NOT NULL (the table predates
    // multi-provider auth): insert with a synthetic, deterministic id derived
    // from the email so it won't collide with real Google IDs and re-tries
    // resolve to the same value.
    const synthetic = `mlink_${createHash("sha256")
      .update(email)
      .digest("hex")
      .slice(0, 32)}`;
    const { rows } = await sql`
      INSERT INTO users (google_id, email, name, avatar_url)
      VALUES (${synthetic}, ${email}, ${name}, '')
      RETURNING *
    `;
    return rows[0];
  }
}

// preview_image_url was added in code without a migration; self-init it so
// inserts don't 500 on databases that predate the column.
let designColumnsReady = false;
async function ensureDesignColumns() {
  if (designColumnsReady) return;
  await sql`ALTER TABLE designs ADD COLUMN IF NOT EXISTS preview_image_url TEXT`;
  // Items the user chose to remove in the tidy-up step (labels), shown on the
  // design page alongside selected_items ("what changed").
  await sql`ALTER TABLE designs ADD COLUMN IF NOT EXISTS removed_items JSONB`;
  designColumnsReady = true;
}

// Logs every paid image-generation call (design / restyle / empty-room) so cost
// can be tracked against ACTUAL calls, not just saved designs — most calls
// (failed/abandoned/retried) never produce a design row but are still billed.
let imageGenSchemaReady = false;
async function ensureImageGenSchema() {
  if (imageGenSchemaReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS image_gen_events (
      id BIGSERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      kind TEXT NOT NULL,
      user_id TEXT
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_image_gen_events_created ON image_gen_events (created_at)`;
  imageGenSchemaReady = true;
}

/**
 * Record one image-generation call. Best-effort: never throws into the caller,
 * so logging can't break (or delay-fail) the actual generation.
 * `kind` is one of "design" | "restyle" | "empty".
 */
export async function recordImageGen(kind: string, userId?: string | null) {
  try {
    await ensureImageGenSchema();
    await sql`INSERT INTO image_gen_events (kind, user_id) VALUES (${kind}, ${userId ?? null})`;
  } catch (err) {
    console.error("[recordImageGen] failed (non-fatal):", err);
  }
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
  removedItems?: unknown;
  originalBlur?: string | null;
  generatedBlur?: string | null;
  // Watermarked, downscaled preview served to non-entitled viewers (paywall).
  previewImageUrl?: string | null;
}) {
  await ensureDesignColumns();
  const { rows } = await sql`
    INSERT INTO designs (mode, event_config, room_analysis, products, hotspots, design_narrative, original_image_url, generated_image_url, preview_image_url, user_id, is_unlocked, selected_items, removed_items, original_blur, generated_blur)
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
      ${JSON.stringify(params.removedItems ?? null)},
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

// ─── Design sharing (email-verified, privacy model) ───
// A non-public design is viewable only by its owner, admins, and the emails in
// design_shares. Recipients must sign in with Google using the shared email.
let sharesSchemaReady = false;
async function ensureSharesSchema() {
  if (sharesSchemaReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS design_shares (
      id BIGSERIAL PRIMARY KEY,
      design_id TEXT NOT NULL,
      email TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (design_id, email)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_design_shares_design ON design_shares (design_id)`;
  sharesSchemaReady = true;
}

export async function addDesignShare(designId: string, email: string) {
  await ensureSharesSchema();
  await sql`
    INSERT INTO design_shares (design_id, email)
    VALUES (${designId}, ${email.trim().toLowerCase()})
    ON CONFLICT (design_id, email) DO NOTHING
  `;
}

// ─── Decor waitlist leads ───
// Demand-validation for a physical decoration-build service advertised on event
// designs (India only). Each row is a waitlist signup; the quoted price is
// captured so we know what figure a lead saw even if pricing later changes.
let decorLeadsSchemaReady = false;
async function ensureDecorLeadsSchema() {
  if (decorLeadsSchemaReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS decor_leads (
      id BIGSERIAL PRIMARY KEY,
      design_id TEXT,
      event_label TEXT,
      email TEXT NOT NULL,
      phone TEXT,
      event_date TEXT,
      city TEXT,
      locale TEXT,
      quoted_price_minor BIGINT,
      currency TEXT,
      duration_label TEXT,
      user_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_decor_leads_created ON decor_leads (created_at)`;
  decorLeadsSchemaReady = true;
}

export interface DecorLead {
  designId?: string | null;
  eventLabel?: string | null;
  email: string;
  phone?: string | null;
  eventDate?: string | null;
  city?: string | null;
  locale?: string | null;
  quotedPriceMinor?: number | null;
  currency?: string | null;
  durationLabel?: string | null;
  userId?: string | null;
}

export async function saveDecorLead(lead: DecorLead) {
  await ensureDecorLeadsSchema();
  await sql`
    INSERT INTO decor_leads (
      design_id, event_label, email, phone, event_date, city, locale,
      quoted_price_minor, currency, duration_label, user_id
    ) VALUES (
      ${lead.designId ?? null}, ${lead.eventLabel ?? null},
      ${lead.email.trim().toLowerCase()}, ${lead.phone ?? null},
      ${lead.eventDate ?? null}, ${lead.city ?? null}, ${lead.locale ?? null},
      ${lead.quotedPriceMinor ?? null}, ${lead.currency ?? null},
      ${lead.durationLabel ?? null}, ${lead.userId ?? null}
    )
  `;
}

export interface DecorLeadRow {
  id: string;
  design_id: string | null;
  event_label: string | null;
  email: string;
  phone: string | null;
  event_date: string | null;
  city: string | null;
  locale: string | null;
  quoted_price_minor: string | null;
  currency: string | null;
  duration_label: string | null;
  user_id: string | null;
  created_at: string;
}

export async function listDecorLeads(limit = 500): Promise<DecorLeadRow[]> {
  await ensureDecorLeadsSchema();
  const { rows } = await sql`
    SELECT id, design_id, event_label, email, phone, event_date, city, locale,
           quoted_price_minor, currency, duration_label, user_id, created_at
    FROM decor_leads
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return rows as DecorLeadRow[];
}

export async function removeDesignShare(designId: string, email: string) {
  await ensureSharesSchema();
  await sql`
    DELETE FROM design_shares
    WHERE design_id = ${designId} AND email = ${email.trim().toLowerCase()}
  `;
}

export async function listDesignShares(
  designId: string
): Promise<{ email: string; created_at: string }[]> {
  await ensureSharesSchema();
  const { rows } = await sql`
    SELECT email, created_at FROM design_shares
    WHERE design_id = ${designId} ORDER BY created_at ASC
  `;
  return rows as { email: string; created_at: string }[];
}

export async function isDesignSharedWith(
  designId: string,
  email: string
): Promise<boolean> {
  await ensureSharesSchema();
  const { rows } = await sql`
    SELECT 1 FROM design_shares
    WHERE design_id = ${designId} AND email = ${email.trim().toLowerCase()}
    LIMIT 1
  `;
  return rows.length > 0;
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

/** Admin-only: every generated design (regardless of privacy/gallery status),
 *  newest first, with the owner's email — for reviewing outputs to refine
 *  prompts. Paginated. */
export async function getAllDesigns(opts: { limit?: number; offset?: number } = {}) {
  const limit = Math.min(opts.limit ?? 60, 120);
  const offset = opts.offset ?? 0;
  const { rows } = await sql.query(
    `SELECT d.id, d.mode, d.design_narrative, d.original_image_url,
            d.generated_image_url, d.created_at, d.is_unlocked, d.gallery_status,
            u.email AS user_email
     FROM designs d
     LEFT JOIN users u ON u.id = d.user_id
     ORDER BY d.created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
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
  // Don't duplicate an event the user already saved — designing the same event
  // multiple times shouldn't add the same date again (no unique constraint, so
  // guard at insert time).
  await sql`
    INSERT INTO event_dates (user_id, event_type, event_label, event_date, honoree)
    SELECT ${params.userId}, ${params.eventType}, ${params.eventLabel}, ${params.eventDate}, ${params.honoree || null}
    WHERE NOT EXISTS (
      SELECT 1 FROM event_dates
      WHERE user_id = ${params.userId}
        AND event_type = ${params.eventType}
        AND event_date = ${params.eventDate}
        AND COALESCE(honoree, '') = COALESCE(${params.honoree || null}, '')
    )
  `;
}

export async function getUserEventDates(userId: string) {
  // De-duplicate on read too, so events saved before the insert-time guard (or
  // any residual dupes) collapse to one card per event/date/honoree.
  const { rows } = await sql`
    SELECT * FROM (
      SELECT DISTINCT ON (event_type, event_date, COALESCE(honoree, ''))
             *
      FROM event_dates
      WHERE user_id = ${userId}
      ORDER BY event_type, event_date, COALESCE(honoree, ''), id
    ) t
    ORDER BY event_date ASC
  `;
  return rows;
}

/** Next occurrence (YYYY-MM-DD) of a saved event, or null if it has passed and doesn't recur.
 *  Recurring events roll to their next annual anniversary (matching the dashboard's daysUntil);
 *  one-time events (baby shower, housewarming) only ever fire on their actual stored date. */
function nextEventOccurrence(eventType: string, eventDate: string): string | null {
  const stored = new Date(eventDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const asDate = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  if (isOneTimeEvent(eventType)) {
    return stored >= today ? asDate(stored) : null;
  }

  // Recurring: next anniversary on/after today. Clamp Feb 29 → Feb 28 in non-leap years.
  const month = stored.getMonth();
  const day = stored.getDate();
  const makeOccurrence = (year: number) => {
    const d = new Date(year, month, day);
    if (d.getMonth() !== month) d.setDate(0); // day overflowed the month (e.g. Feb 29) → last day
    return d;
  };
  let occ = makeOccurrence(today.getFullYear());
  if (occ < today) occ = makeOccurrence(today.getFullYear() + 1);
  return asDate(occ);
}

/** Returns upcoming events (within daysAhead days) with the user's email/name for reminder emails.
 *  Recurring events use their next annual occurrence; one-time events only fire once. */
export async function getUpcomingEventReminders(daysAhead: number) {
  const { rows } = await sql`
    SELECT
      ed.id, ed.event_type, ed.event_label, ed.event_date, ed.honoree,
      u.email, u.name
    FROM event_dates ed
    JOIN users u ON u.id = ed.user_id
  `;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + daysAhead);

  return (rows as {
    id: string;
    event_type: string;
    event_label: string;
    event_date: string;
    honoree: string | null;
    email: string;
    name: string | null;
  }[])
    .map((r) => {
      const next = nextEventOccurrence(r.event_type, r.event_date);
      return next ? { ...r, event_date: next } : null;
    })
    .filter((r): r is NonNullable<typeof r> => {
      if (!r) return false;
      const d = new Date(r.event_date);
      return d >= today && d <= horizon;
    })
    .sort((a, b) => a.event_date.localeCompare(b.event_date));
}

/** Analytics: aggregate stats for the admin dashboard. */
export async function getAnalyticsStats() {
  await ensurePaymentsColumns();
  await ensureImageGenSchema();
  const [totals, funnel, revenue, revenueByCurrency, roomTypes, signups, imageGenDaily, imageGenTotals] = await Promise.all([
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
    sql`
      SELECT
        to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE kind = 'design') AS design,
        COUNT(*) FILTER (WHERE kind = 'restyle') AS restyle,
        COUNT(*) FILTER (WHERE kind = 'empty') AS empty,
        COUNT(*) FILTER (WHERE kind = 'makeover') AS makeover
      FROM image_gen_events
      WHERE created_at >= NOW() - INTERVAL '14 days'
      GROUP BY 1
      ORDER BY 1 DESC
    `,
    sql`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') AS calls_7d,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') AS calls_30d,
        COUNT(*) FILTER (WHERE kind = 'empty' AND created_at >= NOW() - INTERVAL '30 days') AS empty_30d
      FROM image_gen_events
    `,
  ]);

  return {
    totals: totals.rows[0],
    funnel: funnel.rows[0],
    revenue: revenue.rows[0],
    revenueByCurrency: revenueByCurrency.rows,
    roomTypes: roomTypes.rows,
    signups: signups.rows[0],
    imageGen: {
      daily: imageGenDaily.rows,
      totals: imageGenTotals.rows[0],
    },
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

// ─── Feature flags ───

let featuresSchemaReady = false;

async function ensureFeaturesSchema() {
  if (featuresSchemaReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS site_features (
      key TEXT PRIMARY KEY,
      enabled BOOLEAN NOT NULL DEFAULT false,
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `;
  await sql`
    INSERT INTO site_features (key, enabled) VALUES ('makeover', false)
    ON CONFLICT (key) DO NOTHING
  `;
  await sql`
    INSERT INTO site_features (key, enabled) VALUES ('first_design_free', true)
    ON CONFLICT (key) DO NOTHING
  `;
  featuresSchemaReady = true;
}

// Feature flags change rarely (admin toggles) but are read on every dashboard
// mount + every makeover API call. Cache in-module (per serverless instance,
// 60s TTL) so it's one DB round-trip per instance, not per request — kills the
// occasional cold-DB latency spike on /api/features.
let featuresCache: { at: number; value: Record<string, boolean> } | null = null;
const FEATURES_TTL_MS = 60 * 1000;

export async function getFeatures(): Promise<Record<string, boolean>> {
  if (featuresCache && Date.now() - featuresCache.at < FEATURES_TTL_MS) {
    return featuresCache.value;
  }
  await ensureFeaturesSchema();
  const { rows } = await sql`SELECT key, enabled FROM site_features`;
  const result: Record<string, boolean> = { makeover: false, first_design_free: false };
  for (const row of rows) result[row.key] = row.enabled;
  featuresCache = { at: Date.now(), value: result };
  return result;
}

export async function setFeature(key: string, enabled: boolean) {
  await ensureFeaturesSchema();
  await sql`
    INSERT INTO site_features (key, enabled, updated_at) VALUES (${key}, ${enabled}, now())
    ON CONFLICT (key) DO UPDATE SET enabled = ${enabled}, updated_at = now()
  `;
  featuresCache = null; // invalidate so the admin toggle takes effect immediately
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
