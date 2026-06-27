// One-time / idempotent schema migration. Run at deploy (or locally) with:
//   npm run db:migrate
//
// This replaces the old per-request `ensureBillingSchema()` / `ensureRestyleColumn()`
// DDL that used to run on cold starts inside src/lib/db.ts. Run it once whenever
// the schema below changes. All statements are idempotent (IF NOT EXISTS), so
// re-running is safe.
//
// Note: the core tables (users, designs, design_likes, event_dates, payments)
// are assumed to already exist — this migration only owns the billing/coupon/
// checkout-funnel tables and the restyle-lineage column.

import { config } from "dotenv";
// Load env the same way the app does locally (Vercel injects these in prod).
config({ path: ".env.local" });
config(); // also pick up a plain .env if present

const { sql } = await import("@vercel/postgres");

async function migrate() {
  console.log("[migrate] applying schema…");

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

  // Abandoned-checkout funnel: one row per user+design that started checkout.
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

  // Restyle lineage (save-as-new).
  await sql`ALTER TABLE designs ADD COLUMN IF NOT EXISTS restyled_from UUID`;

  // Watermarked preview served to non-entitled viewers (R1 paywall enforcement).
  await sql`ALTER TABLE designs ADD COLUMN IF NOT EXISTS preview_image_url TEXT`;

  // Seed default prices (no-op once set).
  await sql`INSERT INTO pricing (locale, actual_amount, sale_amount, currency)
            VALUES ('IN', 9900, 9900, 'inr') ON CONFLICT (locale) DO NOTHING`;
  await sql`INSERT INTO pricing (locale, actual_amount, sale_amount, currency)
            VALUES ('US', 499, 499, 'usd') ON CONFLICT (locale) DO NOTHING`;

  console.log("[migrate] done.");
}

migrate()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[migrate] failed:", err);
    process.exit(1);
  });
