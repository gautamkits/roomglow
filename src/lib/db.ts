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
}) {
  const { rows } = await sql`
    INSERT INTO designs (mode, event_config, room_analysis, products, hotspots, design_narrative, original_image_url, generated_image_url, user_id, is_unlocked, selected_items)
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
      ${JSON.stringify(params.selectedItems ?? null)}
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
    SELECT id, mode, event_config, design_narrative, generated_image_url, is_unlocked, created_at
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
