import { sql } from "@vercel/postgres";
import { createHash } from "crypto";
import { isOneTimeEvent } from "@/lib/events";

export async function findUserByGoogleId(googleId: string) {
  const { rows } = await sql`
    SELECT * FROM users WHERE google_id = ${googleId} LIMIT 1
  `;
  return rows[0] || null;
}

/**
 * Look up a user by id — needed when acting on someone's behalf (an admin
 * generating and emailing a design to the design's owner) rather than on the
 * signed-in session.
 */
export async function getUserById(userId: string) {
  const { rows } = await sql`
    SELECT id, email, name FROM users WHERE id = ${userId} LIMIT 1
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
  // Lineage root for regenerated designs. Only ever created by
  // scripts/migrate.mjs, which has never been run against production — so
  // setRestyledFrom/countRestyles blew up with "column restyled_from does not
  // exist" the first time anything actually called them. Self-init it here with
  // the other drifted columns.
  await sql`ALTER TABLE designs ADD COLUMN IF NOT EXISTS restyled_from UUID`;
  // The emptied canvas the design was actually rendered on, when it differs
  // from the upload. `original_image_url` stays the true photo so before/after
  // and the reveal video keep showing the room the user photographed — but
  // restyle and admin regenerate re-render from scratch, and re-rendering from
  // the furnished photo silently puts back the furniture the design was built
  // without. Null on every design that was rendered on the original.
  await sql`ALTER TABLE designs ADD COLUMN IF NOT EXISTS cleared_image_url TEXT`;
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

let feedbackSchemaReady = false;
async function ensureFeedbackSchema() {
  if (feedbackSchemaReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS design_feedback (
      id BIGSERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      design_id UUID NOT NULL,
      user_id TEXT NOT NULL,
      rating TEXT NOT NULL,
      reason TEXT
    )
  `;
  // One verdict per person per design — a second submission edits the first
  // rather than stacking, which is what makes the upsert below work. user_id is
  // NOT NULL precisely so this index can do its job; a NULL would slip past it.
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_design_feedback_one
      ON design_feedback (design_id, user_id)
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_design_feedback_created ON design_feedback (created_at)`;
  feedbackSchemaReady = true;
}

export type DesignRating = "happy" | "ok" | "sad";

/**
 * Save (or change) one person's verdict on a design.
 *
 * Returns the PREVIOUS rating, not just whether the row is new. The caller
 * alerts on a transition INTO a low rating, and "is this row new" cannot
 * express that: someone who taps 😍 and then changes to 😞 is not a new row,
 * and that complaint used to reach nobody.
 */
export async function saveDesignFeedback(params: {
  designId: string;
  userId: string;
  rating: DesignRating;
  reason?: string | null;
}): Promise<{ ok: boolean; isNew: boolean; previousRating: DesignRating | null }> {
  try {
    await ensureFeedbackSchema();
    const { rows: prevRows } = await sql`
      SELECT rating, reason FROM design_feedback
      WHERE design_id = ${params.designId}::uuid AND user_id = ${params.userId}
      LIMIT 1
    `;
    const previousRating = (prevRows[0]?.rating as DesignRating | undefined) ?? null;
    const previousReason = (prevRows[0]?.reason as string | null | undefined) ?? null;

    // A reason belongs to the rating it was written about. Carrying it across a
    // change left "the backdrop didn't match" attached to a happy face — wrong
    // in the admin list and wrong in the stats. Keep it only while the verdict
    // is unchanged, or when a fresh one is supplied.
    const reason =
      params.reason ?? (previousRating === params.rating ? previousReason : null);

    await sql`
      INSERT INTO design_feedback (design_id, user_id, rating, reason)
      VALUES (${params.designId}::uuid, ${params.userId}, ${params.rating}, ${reason})
      ON CONFLICT (design_id, user_id) DO UPDATE
        SET rating = EXCLUDED.rating,
            reason = EXCLUDED.reason,
            created_at = NOW()
    `;
    return { ok: true, isNew: previousRating === null, previousRating };
  } catch (err) {
    console.error("[saveDesignFeedback] failed:", err);
    return { ok: false, isNew: false, previousRating: null };
  }
}

/** This user's existing rating for a design, so the UI can show it selected. */
export async function getDesignFeedback(
  designId: string,
  userId: string
): Promise<{ rating: DesignRating; reason: string | null } | null> {
  try {
    await ensureFeedbackSchema();
    const { rows } = await sql`
      SELECT rating, reason FROM design_feedback
      WHERE design_id = ${designId}::uuid AND user_id = ${userId} LIMIT 1
    `;
    const r = rows[0];
    return r ? { rating: r.rating as DesignRating, reason: r.reason ?? null } : null;
  } catch {
    return null;
  }
}

/** Rating counts for the admin analytics panel. */
export async function getFeedbackStats(days = 30): Promise<
  { rating: string; n: number }[]
> {
  try {
    await ensureFeedbackSchema();
    const { rows } = await sql`
      SELECT rating, COUNT(*)::int AS n FROM design_feedback
      WHERE created_at >= NOW() - (${days} || ' days')::interval
      GROUP BY rating
    `;
    return rows.map((r) => ({ rating: r.rating as string, n: r.n as number }));
  } catch {
    return [];
  }
}

/**
 * Record one image-generation call. Best-effort: never throws into the caller,
 * so logging can't break (or delay-fail) the actual generation.
 * `kind` is one of "design" | "restyle" | "empty" | "makeover" | "edit"
 * ("edit" = an admin touch-up via admin/edit-design).
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
  /** The emptied canvas actually rendered on, when it differs from the upload. */
  clearedImageUrl?: string | null;
}) {
  await ensureDesignColumns();
  const { rows } = await sql`
    INSERT INTO designs (mode, event_config, room_analysis, products, hotspots, design_narrative, original_image_url, generated_image_url, preview_image_url, user_id, is_unlocked, selected_items, removed_items, original_blur, generated_blur, cleared_image_url)
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
      ${params.generatedBlur ?? null},
      ${params.clearedImageUrl ?? null}
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

/**
 * Replace the rendered image of an existing design, in place.
 *
 * Every other regenerate/restyle path inserts a NEW row, which is right when
 * the products change — the old design stays valid and gets its own link. An
 * admin touch-up is the opposite case: same products, same hotspots, one
 * corrected render, applied while the design sits in the review queue. Forking
 * it there would leave a stale duplicate to moderate.
 *
 * Deliberately does NOT touch `hotspots` or `products`: the pins still point at
 * the right things because the product set is unchanged and the edit preserves
 * framing. Pass a preview only for locked designs.
 */
export async function updateDesignImage(
  designId: string,
  opts: {
    generatedImageUrl: string;
    generatedBlur?: string | null;
    previewImageUrl?: string | null;
  }
) {
  await ensureDesignColumns();
  await sql`
    UPDATE designs
       SET generated_image_url = ${opts.generatedImageUrl},
           generated_blur      = COALESCE(${opts.generatedBlur ?? null}, generated_blur),
           preview_image_url   = COALESCE(${opts.previewImageUrl ?? null}, preview_image_url)
     WHERE id = ${designId}
  `;
}

// ─── Gallery ───
export async function requestGalleryPublish(
  designId: string,
  userId: string,
  // Admins submit designs they do not own (curating the gallery from /admin).
  // Without this the ownership predicate matches nothing and the button looks
  // dead — no row updated, no error, nothing in pending review.
  asAdmin = false
) {
  const { rowCount } = asAdmin
    ? await sql`
        UPDATE designs SET gallery_status = 'pending'
        WHERE id = ${designId} AND gallery_status IN ('none', 'rejected')
      `
    : await sql`
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
/**
 * Designs that got a rating, newest first, with the inputs that produced them.
 *
 * getAllDesigns deliberately selects a narrow column set for the admin grid, and
 * that set answers "what did it look like" but never "why did it look like
 * that". Diagnosing a complaint meant opening Postgres. This widens the query to
 * the fields that actually explain a bad design — what the analysis saw, whether
 * the room really got cleared, and how many product slots came back empty.
 */
let lessonsSchemaReady = false;
async function ensureLessonsSchema() {
  if (lessonsSchemaReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS design_lessons (
      id BIGSERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      scope_type TEXT NOT NULL,
      scope_value TEXT NOT NULL,
      rule TEXT NOT NULL,
      source_feedback_id BIGINT,
      active BOOLEAN NOT NULL DEFAULT false,
      verified_at TIMESTAMPTZ
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_design_lessons_scope
      ON design_lessons (scope_type, scope_value, active)
  `;
  lessonsSchemaReady = true;
}

export interface DesignLesson {
  id: number;
  scope_type: string;
  scope_value: string;
  rule: string;
  active: boolean;
  verified_at: string | null;
  created_at: string;
}

/** Hard caps. Rules accumulate silently, and a brief stuffed with twenty
 *  half-contradictory instructions degrades designs in a way that reads as a
 *  model regression rather than as something we did to ourselves. */
export const MAX_ACTIVE_LESSONS = 6;
export const MAX_LESSON_CHARS = 200;

const LESSONS_TTL_MS = 60 * 1000;
let lessonsCache: { at: number; value: DesignLesson[] } | null = null;

/** Every active lesson, cached — generation must not pay a DB round-trip. */
async function allActiveLessons(): Promise<DesignLesson[]> {
  if (lessonsCache && Date.now() - lessonsCache.at < LESSONS_TTL_MS) {
    return lessonsCache.value;
  }
  try {
    await ensureLessonsSchema();
    const { rows } = await sql`
      SELECT id, scope_type, scope_value, rule, active, verified_at, created_at
      FROM design_lessons WHERE active = true ORDER BY created_at ASC
    `;
    const value = rows as unknown as DesignLesson[];
    lessonsCache = { at: Date.now(), value };
    return value;
  } catch (err) {
    // Never let a lessons failure break generation — no rules is the old,
    // known-good behaviour.
    console.error("[allActiveLessons] failed (non-fatal):", err);
    return [];
  }
}

/**
 * Active rules for one event, newest-capped.
 *
 * v1 is event-scoped only. The rules are injected in buildEventContext, which
 * returns undefined for space, so a rule cannot reach a room redesign by
 * construction — see CLAUDE.md on space being hands-off.
 */
export async function getLessonsForEvent(eventType: string): Promise<string[]> {
  const all = await allActiveLessons();
  return all
    .filter((l) => l.scope_type === "event" && l.scope_value === eventType)
    .slice(0, MAX_ACTIVE_LESSONS)
    .map((l) => l.rule);
}

export async function listLessons(): Promise<DesignLesson[]> {
  await ensureLessonsSchema();
  const { rows } = await sql`
    SELECT id, scope_type, scope_value, rule, active, verified_at, created_at
    FROM design_lessons ORDER BY created_at DESC LIMIT 200
  `;
  return rows as unknown as DesignLesson[];
}

export async function createLesson(params: {
  scopeType: string;
  scopeValue: string;
  rule: string;
  sourceFeedbackId?: number | null;
}): Promise<{ ok: boolean; id?: number; error?: string }> {
  const rule = params.rule.trim().slice(0, MAX_LESSON_CHARS);
  if (!rule) return { ok: false, error: "Empty rule" };
  try {
    await ensureLessonsSchema();
    const { rows } = await sql`
      INSERT INTO design_lessons (scope_type, scope_value, rule, source_feedback_id)
      VALUES (${params.scopeType}, ${params.scopeValue}, ${rule}, ${params.sourceFeedbackId ?? null})
      RETURNING id
    `;
    lessonsCache = null;
    // BIGSERIAL comes back from the driver as a string; the declared type says
    // number, so coerce rather than hand callers a lie they might do maths on.
    return { ok: true, id: Number(rows[0]?.id) };
  } catch (err) {
    console.error("[createLesson] failed:", err);
    return { ok: false, error: "Insert failed" };
  }
}

/** Activating enforces the per-scope cap, so the brief can't grow without bound. */
export async function setLessonActive(
  id: number,
  active: boolean
): Promise<{ ok: boolean; error?: string }> {
  try {
    await ensureLessonsSchema();
    if (active) {
      const { rows } = await sql`
        SELECT scope_type, scope_value FROM design_lessons WHERE id = ${id} LIMIT 1
      `;
      const l = rows[0];
      if (!l) return { ok: false, error: "Not found" };
      const { rows: c } = await sql`
        SELECT COUNT(*)::int AS n FROM design_lessons
        WHERE active = true AND scope_type = ${l.scope_type} AND scope_value = ${l.scope_value}
      `;
      if ((c[0]?.n ?? 0) >= MAX_ACTIVE_LESSONS) {
        return { ok: false, error: `At most ${MAX_ACTIVE_LESSONS} active rules per scope` };
      }
    }
    // NOW() has to stay SQL. Interpolating it through the tag would bind the
    // literal string "NOW()" as a parameter, and Postgres rejects that as a
    // timestamptz at runtime — a failure no typecheck would have caught.
    await sql`
      UPDATE design_lessons
      SET active = ${active},
          verified_at = CASE WHEN ${active} THEN NOW() ELSE NULL END
      WHERE id = ${id}
    `;
    lessonsCache = null;
    return { ok: true };
  } catch (err) {
    console.error("[setLessonActive] failed:", err);
    return { ok: false, error: "Update failed" };
  }
}

export async function deleteLesson(id: number): Promise<{ ok: boolean }> {
  try {
    await ensureLessonsSchema();
    await sql`DELETE FROM design_lessons WHERE id = ${id}`;
    lessonsCache = null;
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function getFeedbackDesigns(
  opts: { limit?: number; offset?: number; badOnly?: boolean } = {}
) {
  await ensureFeedbackSchema();
  const limit = Math.min(opts.limit ?? 40, 120);
  const offset = opts.offset ?? 0;
  const where = opts.badOnly ? `WHERE f.rating IN ('sad','ok')` : "";
  const { rows } = await sql.query(
    `SELECT f.rating, f.reason, f.created_at AS rated_at,
            d.id, d.mode, d.design_narrative, d.original_image_url,
            d.generated_image_url, d.created_at, d.is_unlocked, d.gallery_status,
            d.event_config, d.user_id, d.selected_items, d.removed_items,
            (d.cleared_image_url IS NOT NULL) AS was_cleared,
            d.room_analysis, d.products,
            u.email AS user_email
     FROM design_feedback f
     JOIN designs d ON d.id = f.design_id
     LEFT JOIN users u ON u.id = d.user_id
     ${where}
     ORDER BY f.created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  // Summarise server-side: products/room_analysis are large JSONB blobs and the
  // admin list only needs the handful of fields that explain the outcome.
  return rows.map((r) => {
    const ra = asObj(r.room_analysis);
    const products = Array.isArray(asObj(r.products)) ? (asObj(r.products) as unknown[]) : [];
    let matched = 0;
    let noMatch = 0;
    for (const p of products as { amazonProduct?: unknown }[]) {
      if (p && p.amazonProduct) matched++;
      else noMatch++;
    }
    return {
      ...r,
      room_analysis: undefined,
      products: undefined,
      diagnostics: {
        roomType: (ra as Record<string, unknown>)?.roomType ?? null,
        clutterLevel: (ra as Record<string, unknown>)?.clutterLevel ?? null,
        venueKind: (ra as Record<string, unknown>)?.venueKind ?? null,
        hadStagingPlan: !!(ra as Record<string, unknown>)?.stagingPlan,
        productCount: products.length,
        matched,
        noMatch,
      },
    };
  });
}

/** JSONB columns arrive parsed from the driver, but tolerate a string too. */
function asObj(raw: unknown): unknown {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return raw ?? null;
}

export async function getAllDesigns(opts: { limit?: number; offset?: number } = {}) {
  const limit = Math.min(opts.limit ?? 60, 120);
  const offset = opts.offset ?? 0;
  const { rows } = await sql.query(
    `SELECT d.id, d.mode, d.design_narrative, d.original_image_url,
            d.generated_image_url, d.created_at, d.is_unlocked, d.gallery_status,
            d.event_config, d.user_id,
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

/**
 * Unlock a design an admin does NOT own — comping a user, or fixing a botched
 * payment.
 *
 * Separate from unlockDesign because that one is an ownership *claim*: its
 * WHERE clause only matches an unowned design or your own, and it reassigns
 * user_id to the caller. Run as an admin against someone else's design it
 * updates zero rows and returns false, silently — which is exactly how an
 * admin coupon unlock looked like it worked and persisted nothing.
 *
 * user_id is deliberately left alone here. Unlocking someone's design must
 * never transfer it to the admin: ownership drives designVisibility, the
 * user's own gallery, and their design-ready email.
 */
export async function unlockDesignAsAdmin(designId: string): Promise<boolean> {
  const { rowCount } = await sql`
    UPDATE designs SET is_unlocked = true WHERE id = ${designId}
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
  await ensureEmailPrefsSchema();
  // This used to select the entire event_dates table and filter in JS. The
  // exact next-occurrence logic still has to run in JS (one-time vs recurring
  // comes from events.ts), but the rows that could not possibly match are now
  // excluded in SQL: either the stored date is still ahead of us, or the
  // month/day is within the window ignoring the year. The day-of-year
  // comparison wraps at the new year, and the extra 2 days of slack absorb
  // leap-year drift, so a real match is never filtered out here.
  const { rows } = await sql`
    SELECT
      ed.id, ed.event_type, ed.event_label, ed.event_date, ed.honoree,
      u.email, u.name
    FROM event_dates ed
    JOIN users u ON u.id = ed.user_id
    WHERE u.email <> ''
      AND NOT EXISTS (
        SELECT 1 FROM email_optouts eo WHERE eo.email = lower(u.email)
      )
      AND (
        ed.event_date >= CURRENT_DATE
        OR ((EXTRACT(DOY FROM ed.event_date)::int
             - EXTRACT(DOY FROM CURRENT_DATE)::int + 366) % 366)
            <= ${daysAhead + 2}
      )
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
  await ensureFeedbackSchema();
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
        COUNT(*) FILTER (WHERE kind = 'makeover') AS makeover,
        COUNT(*) FILTER (WHERE kind = 'edit') AS edit
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
    // Rating mix overall and per occasion — the per-occasion split is what makes
    // a learned rule's effect visible, rather than just a global average.
    feedback: {
      last30: await getFeedbackStats(30),
      byOccasion: (
        await sql`
          SELECT COALESCE(d.event_config->>'eventLabel', d.mode) AS occasion,
                 f.rating, COUNT(*)::int AS n
          FROM design_feedback f
          JOIN designs d ON d.id = f.design_id
          WHERE f.created_at >= NOW() - INTERVAL '30 days'
          GROUP BY occasion, f.rating
          ORDER BY n DESC
        `
      ).rows,
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

// checkout_intents was only ever created by scripts/migrate.mjs, which has
// never been run against production — so the abandoned-checkout cron was the
// one code path that could fail outright with "relation does not exist".
// Self-init it here alongside the other drifted schema.
let checkoutIntentsReady = false;
async function ensureCheckoutIntentsSchema() {
  if (checkoutIntentsReady) return;
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
  checkoutIntentsReady = true;
}

export async function recordCheckoutIntent(p: {
  userId: string;
  designId: string;
  email: string;
  name?: string | null;
  amount: number;
  currency: string;
}) {
  await ensureCheckoutIntentsSchema();
  // Deliberately does NOT reset last_reminder_stage or created_at. Re-opening
  // checkout on the same design used to restart the whole 3-email series from
  // day 1, so a user who kept revisiting could be sent the day-4 "20% off"
  // mail over and over. The funnel now runs at most once per (user, design).
  await sql`
    INSERT INTO checkout_intents (user_id, design_id, email, name, amount, currency)
    VALUES (${p.userId}, ${p.designId}, ${p.email}, ${p.name || null}, ${p.amount}, ${p.currency})
    ON CONFLICT (user_id, design_id) DO UPDATE SET
      email = EXCLUDED.email,
      name = EXCLUDED.name,
      amount = EXCLUDED.amount,
      currency = EXCLUDED.currency
  `;
}

// Intents that are still unpaid and haven't finished the 3-stage funnel.
// Bounded to the last 30 days so an ancient intent isn't "due" forever.
export async function getDueCheckoutReminders() {
  await ensureCheckoutIntentsSchema();
  await ensureEmailPrefsSchema();
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
      AND ci.created_at > now() - INTERVAL '30 days'
      AND NOT EXISTS (
        SELECT 1 FROM email_optouts eo WHERE lower(eo.email) = lower(ci.email)
      )
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
  await ensureCheckoutIntentsSchema();
  await sql`UPDATE checkout_intents SET last_reminder_stage = ${stage} WHERE id = ${id}`;
}

// ─── Email opt-out (marketing suppression) ───
// One global opt-out list keyed by lowercased email. It suppresses MARKETING
// mail only — the abandoned-checkout series, event reminders and the activation
// funnel. Transactional mail (design-ready, magic-link sign-in, share invites)
// always sends: a user who opted out of marketing still needs the thing they
// paid for and the link they asked for.
let emailPrefsReady = false;
export async function ensureEmailPrefsSchema() {
  if (emailPrefsReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS email_optouts (
      email TEXT PRIMARY KEY,
      reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  emailPrefsReady = true;
}

export async function optOutEmail(email: string, reason?: string) {
  await ensureEmailPrefsSchema();
  await sql`
    INSERT INTO email_optouts (email, reason)
    VALUES (${email.trim().toLowerCase()}, ${reason || null})
    ON CONFLICT (email) DO NOTHING
  `;
}

export async function resubscribeEmail(email: string) {
  await ensureEmailPrefsSchema();
  await sql`DELETE FROM email_optouts WHERE email = ${email.trim().toLowerCase()}`;
}

export async function isEmailOptedOut(email: string): Promise<boolean> {
  if (!email) return false;
  await ensureEmailPrefsSchema();
  const { rows } = await sql`
    SELECT 1 FROM email_optouts WHERE email = ${email.trim().toLowerCase()} LIMIT 1
  `;
  return rows.length > 0;
}

// ─── Event-reminder idempotency ───
// event-reminders had no sent-log at all, so any manual re-run, Vercel retry or
// duplicate invocation re-sent every reminder. One row is claimed per
// (event row, occurrence date, threshold) BEFORE the send, so a concurrent run
// loses the race rather than double-mailing.
let reminderLogReady = false;
async function ensureReminderLogSchema() {
  if (reminderLogReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS event_reminder_log (
      event_date_id UUID NOT NULL,
      occurrence DATE NOT NULL,
      days_until INTEGER NOT NULL,
      sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (event_date_id, occurrence, days_until)
    )
  `;
  reminderLogReady = true;
}

/** Claim the right to send one reminder. Returns false if already claimed. */
export async function claimEventReminder(
  eventDateId: string,
  occurrence: string,
  daysUntil: number
): Promise<boolean> {
  await ensureReminderLogSchema();
  const { rows } = await sql`
    INSERT INTO event_reminder_log (event_date_id, occurrence, days_until)
    VALUES (${eventDateId}, ${occurrence}, ${daysUntil})
    ON CONFLICT DO NOTHING
    RETURNING event_date_id
  `;
  return rows.length > 0;
}

/** Release a claim when the send failed, so the next run can retry it. */
export async function releaseEventReminder(
  eventDateId: string,
  occurrence: string,
  daysUntil: number
) {
  await ensureReminderLogSchema();
  await sql`
    DELETE FROM event_reminder_log
     WHERE event_date_id = ${eventDateId}
       AND occurrence = ${occurrence}
       AND days_until = ${daysUntil}
  `;
}

// ─── Activation funnel (signed up, never designed) ───

let activationReady = false;
async function ensureActivationSchema() {
  if (activationReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS activation_emails (
      user_id UUID NOT NULL,
      stage INTEGER NOT NULL,
      sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, stage)
    )
  `;
  // The activation query and getUserReport both probe designs by user_id, which
  // schema.sql never indexed (only idx_designs_gallery exists).
  await sql`CREATE INDEX IF NOT EXISTS idx_designs_user ON designs (user_id)`;
  activationReady = true;
}

export interface ActivationCandidate {
  id: string;
  email: string;
  name: string | null;
  days_since: number;
  last_stage: number;
}

/**
 * Users who signed up but have never created a design.
 *
 * The `NOT EXISTS` on designs is what stops the funnel: the moment a user
 * creates their first design they stop matching, so no further stage is ever
 * sent — no separate cancellation step is needed.
 *
 * Deduped by lowercased email because createUser conflicts on google_id rather
 * than email, so a magic-link user who later signs in with Google has two rows
 * and would otherwise be mailed twice.
 *
 * Bounded to `windowDays` so the first run after deploy doesn't blast the
 * entire back catalogue of users who signed up long ago.
 */
export async function getActivationCandidates(
  windowDays: number
): Promise<ActivationCandidate[]> {
  await ensureActivationSchema();
  await ensureEmailPrefsSchema();
  const { rows } = await sql`
    SELECT DISTINCT ON (lower(u.email))
      u.id, u.email, u.name,
      EXTRACT(EPOCH FROM (now() - u.created_at)) / 86400 AS days_since,
      COALESCE((SELECT MAX(stage) FROM activation_emails a WHERE a.user_id = u.id), 0) AS last_stage
    FROM users u
    WHERE u.email <> ''
      AND u.created_at > now() - (${windowDays} * INTERVAL '1 day')
      AND NOT EXISTS (SELECT 1 FROM designs d WHERE d.user_id = u.id)
      AND NOT EXISTS (
        SELECT 1 FROM email_optouts eo WHERE eo.email = lower(u.email)
      )
    ORDER BY lower(u.email), u.created_at ASC
  `;
  return (rows as ActivationCandidate[]).map((r) => ({
    ...r,
    days_since: Number(r.days_since),
    last_stage: Number(r.last_stage),
  }));
}

/** Claim one activation stage for a user. Returns false if already sent. */
export async function claimActivationEmail(
  userId: string,
  stage: number
): Promise<boolean> {
  await ensureActivationSchema();
  const { rows } = await sql`
    INSERT INTO activation_emails (user_id, stage)
    VALUES (${userId}, ${stage})
    ON CONFLICT DO NOTHING
    RETURNING user_id
  `;
  return rows.length > 0;
}

export async function releaseActivationEmail(userId: string, stage: number) {
  await ensureActivationSchema();
  await sql`
    DELETE FROM activation_emails WHERE user_id = ${userId} AND stage = ${stage}
  `;
}

// ─── Festival campaign (shared calendar, broadcast per market) ───
// Distinct from event_reminder_log, which tracks a user's OWN saved event (their
// kid's birthday). This is the shared calendar: every Indian user hears about 15
// August whether or not they saved it. Separate log table because the dedupe key
// is different — (user, festival, year, threshold) rather than (saved event, …).

let festivalReady = false;
async function ensureFestivalSchema() {
  if (festivalReady) return;
  // `locale` did not exist on users: the market was only ever a cookie, so there
  // was no way to avoid mailing US users about an Indian holiday.
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS locale TEXT`;
  await sql`
    CREATE TABLE IF NOT EXISTS festival_campaign_log (
      user_id UUID NOT NULL,
      event_id TEXT NOT NULL,
      occurrence DATE NOT NULL,
      days_before INTEGER NOT NULL,
      sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, event_id, occurrence, days_before)
    )
  `;
  festivalReady = true;
}

/** Remember which market a user actually browses from. Cheap, idempotent. */
export async function setUserLocale(userId: string, locale: string) {
  await ensureFestivalSchema();
  await sql`
    UPDATE users SET locale = ${locale}
     WHERE id = ${userId} AND (locale IS DISTINCT FROM ${locale})
  `;
}

/**
 * Best-effort market for users who predate the column. Strongest signal first:
 * a real payment's currency, then the market-exclusive events they designed for.
 * Users with no signal are left NULL and are simply not mailed — guessing would
 * send Diwali mail to Americans, which is worse than sending nothing.
 */
export async function backfillUserLocales(
  inOnlyEventIds: string[],
  usOnlyEventIds: string[]
): Promise<{ byPayment: number; byDesign: number; byMarketplace: number; unknown: number }> {
  await ensureFestivalSchema();
  const pay = await sql`
    UPDATE users u SET locale = t.loc FROM (
      SELECT p.user_id, CASE WHEN lower(p.currency) = 'usd' THEN 'US' ELSE 'IN' END AS loc
        FROM payments p WHERE p.status = 'completed'
    ) t WHERE u.id = t.user_id AND u.locale IS NULL
    RETURNING u.id`;

  // Deliberately not SQL: matching a JS array against jsonb needs array-param
  // casting that @vercel/postgres types poorly, and at this table size a loop
  // is free and obviously correct.
  const inSet = new Set(inOnlyEventIds);
  const usSet = new Set(usOnlyEventIds);
  const { rows: recent } = await sql`
    SELECT DISTINCT ON (d.user_id) d.user_id, d.event_config->>'eventType' AS event_type
      FROM designs d
     WHERE d.user_id IS NOT NULL AND d.event_config->>'eventType' IS NOT NULL
     ORDER BY d.user_id, d.created_at DESC`;
  let byDesign = 0;
  for (const r of recent as { user_id: string; event_type: string }[]) {
    const loc = usSet.has(r.event_type)
      ? "US"
      : inSet.has(r.event_type)
        ? "IN"
        : null;
    if (!loc) continue;
    const { rows } = await sql`
      UPDATE users SET locale = ${loc}
       WHERE id = ${r.user_id} AND locale IS NULL RETURNING id`;
    byDesign += rows.length;
  }

  // Third and widest signal: the Amazon marketplace their products came from.
  // Every design carries affiliate URLs, and the domain is unambiguous where an
  // event type (a birthday exists in both markets) is not. This is what actually
  // resolves the bulk of the table.
  const mkt = await sql`
    UPDATE users u SET locale = t.loc FROM (
      SELECT DISTINCT ON (d.user_id) d.user_id,
             CASE WHEN d.products::text LIKE '%www.amazon.com/%' THEN 'US' ELSE 'IN' END AS loc
        FROM designs d
       WHERE d.user_id IS NOT NULL
         -- Must be the AFFILIATE host, not any Amazon host: product image URLs
         -- are on m.media-amazon.com, so a bare '%amazon.com%' matches every
         -- design ever made and marks the whole table US.
         AND (d.products::text LIKE '%www.amazon.in/%'
           OR d.products::text LIKE '%www.amazon.com/%')
       ORDER BY d.user_id, d.created_at DESC
    ) t WHERE u.id = t.user_id AND u.locale IS NULL
    RETURNING u.id`;

  const un = await sql`SELECT count(*)::int n FROM users WHERE locale IS NULL AND email <> ''`;
  return {
    byPayment: pay.rows.length,
    byDesign,
    byMarketplace: mkt.rows.length,
    unknown: Number(un.rows[0].n),
  };
}

export interface FestivalRecipient {
  id: string;
  email: string;
  name: string | null;
}

/** Opted-in users in one market, deduped by email (see getActivationCandidates). */
export async function getFestivalRecipients(
  locale: string
): Promise<FestivalRecipient[]> {
  await ensureFestivalSchema();
  await ensureEmailPrefsSchema();
  const { rows } = await sql`
    SELECT DISTINCT ON (lower(u.email)) u.id, u.email, u.name
      FROM users u
     WHERE u.email <> ''
       AND u.locale = ${locale}
       AND NOT EXISTS (
         SELECT 1 FROM email_optouts eo WHERE eo.email = lower(u.email)
       )
     ORDER BY lower(u.email), u.created_at ASC
  `;
  return rows as FestivalRecipient[];
}

export interface FestivalInspiration {
  id: string;
  imageUrl: string;
  subTheme: string | null;
}

/**
 * Real designs to show inside the campaign email. Gallery-approved ONLY —
 * these are the one class of design that is public to anonymous viewers
 * (see designVisibility), and an email image is fetched by an inbox with no
 * session, so anything else would leak a private design.
 */
export async function getFestivalInspiration(
  eventId: string,
  limit = 3
): Promise<FestivalInspiration[]> {
  const { rows } = await sql`
    SELECT id, generated_image_url AS image_url, event_config->>'subTheme' AS sub_theme
      FROM designs
     WHERE gallery_status = 'approved'
       AND generated_image_url IS NOT NULL
       AND event_config->>'eventType' = ${eventId}
     ORDER BY like_count DESC NULLS LAST, created_at DESC
     LIMIT ${limit}
  `;
  return rows.map((r) => ({
    id: r.id as string,
    imageUrl: r.image_url as string,
    subTheme: (r.sub_theme as string) ?? null,
  }));
}

/** Claim one (user, festival, year, threshold) send. False if already sent. */
export async function claimFestivalSend(
  userId: string,
  eventId: string,
  occurrence: string,
  daysBefore: number
): Promise<boolean> {
  await ensureFestivalSchema();
  const { rows } = await sql`
    INSERT INTO festival_campaign_log (user_id, event_id, occurrence, days_before)
    VALUES (${userId}, ${eventId}, ${occurrence}, ${daysBefore})
    ON CONFLICT DO NOTHING
    RETURNING user_id
  `;
  return rows.length > 0;
}

export async function releaseFestivalSend(
  userId: string,
  eventId: string,
  occurrence: string,
  daysBefore: number
) {
  await ensureFestivalSchema();
  await sql`
    DELETE FROM festival_campaign_log
     WHERE user_id = ${userId} AND event_id = ${eventId}
       AND occurrence = ${occurrence} AND days_before = ${daysBefore}
  `;
}

// ─── Funnel events ───
// Client analytics (PostHog + Meta Pixel) are both blocked inside the Instagram
// in-app browser, which is where most acquisition traffic lands — so the create
// funnel was measurable everywhere except the place it mattered. These rows are
// the ground truth; PostHog stays as the richer-but-lossy signal.

let funnelSchemaReady = false;
async function ensureFunnelSchema() {
  if (funnelSchemaReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS funnel_events (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      user_id UUID,
      locale TEXT,
      props JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_funnel_name_time ON funnel_events (name, created_at DESC)`;
  funnelSchemaReady = true;
}

export async function recordFunnelEvent(e: {
  name: string;
  userId?: string | null;
  locale?: string | null;
  props?: Record<string, unknown> | null;
}) {
  try {
    await ensureFunnelSchema();
    await sql`
      INSERT INTO funnel_events (name, user_id, locale, props)
      VALUES (${e.name}, ${e.userId || null}, ${e.locale || null}, ${
        e.props ? JSON.stringify(e.props) : null
      })
    `;
  } catch (err) {
    console.error("[funnel] record failed:", err);
  }
}

/** Counts per event name over the last N days, for the admin funnel panel. */
export async function getFunnelCounts(days: number = 30) {
  await ensureFunnelSchema();
  const { rows } = await sql`
    SELECT name, COUNT(*)::int AS count,
           COUNT(DISTINCT user_id)::int AS users
    FROM funnel_events
    WHERE created_at > now() - (${days} * INTERVAL '1 day')
    GROUP BY name
    ORDER BY count DESC
  `;
  return rows as { name: string; count: number; users: number }[];
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
  // Photo-first stepped intake. Defaults OFF so the new flow ships dark and is
  // switched on from /admin without a deploy — and switched back the same way.
  await sql`
    INSERT INTO site_features (key, enabled) VALUES ('create_v2', false)
    ON CONFLICT (key) DO NOTHING
  `;
  // Clear the room before designing, instead of decorating around the
  // occupant's furniture. Two keys, not one: for indoor EVENTS a cleared canvas
  // is already the proven behaviour, while for SPACE the repo's own history
  // argues the other way (84be61f measured that "a furnished room treated as
  // bare gets rebuilt", and d5cf7a7 reverted that line after four consecutive
  // fidelity failures). Separate flags mean the space experiment can be run and
  // reversed from /admin without touching events. Both default OFF, so the
  // existing tidy-up flow stays the shipped behaviour until switched on.
  await sql`
    INSERT INTO site_features (key, enabled) VALUES ('always_empty_space', false)
    ON CONFLICT (key) DO NOTHING
  `;
  await sql`
    INSERT INTO site_features (key, enabled) VALUES ('always_empty_event', false)
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
  // Fail-closed defaults. A key missing from this map reads `undefined`, not
  // `false`, so every new flag must be listed here as well as seeded above.
  const result: Record<string, boolean> = {
    makeover: false,
    first_design_free: false,
    create_v2: false,
    always_empty_space: false,
    always_empty_event: false,
  };
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
// restyled_from is self-initialised by ensureDesignColumns(). Both helpers call
// it first: they can run before any insert in this process (the admin
// regenerate path does exactly that), and production predates the column.

/** Number of restyles already created from a given root design. */
export async function countRestyles(rootId: string): Promise<number> {
  await ensureDesignColumns();
  const { rows } = await sql`
    SELECT COUNT(*)::int AS n FROM designs WHERE restyled_from = ${rootId}
  `;
  return rows[0]?.n ?? 0;
}

export async function setRestyledFrom(designId: string, rootId: string) {
  await ensureDesignColumns();
  await sql`UPDATE designs SET restyled_from = ${rootId} WHERE id = ${designId}`;
}
