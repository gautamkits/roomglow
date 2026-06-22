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
}) {
  const { rows } = await sql`
    INSERT INTO designs (mode, event_config, room_analysis, products, hotspots, design_narrative, original_image_url, generated_image_url, user_id, is_unlocked)
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
      ${params.isUnlocked ?? false}
    )
    RETURNING id
  `;
  return rows[0].id as string;
}

export async function getDesign(designId: string) {
  const { rows } = await sql`SELECT * FROM designs WHERE id = ${designId} LIMIT 1`;
  return rows[0] || null;
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
