CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_id TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  name TEXT,
  avatar_url TEXT,
  credits INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS designs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  mode TEXT NOT NULL,
  event_config JSONB,
  room_analysis JSONB,
  products JSONB NOT NULL,
  hotspots JSONB NOT NULL,
  design_narrative TEXT,
  original_image_url TEXT NOT NULL,
  generated_image_url TEXT NOT NULL,
  is_unlocked BOOLEAN DEFAULT false,
  gallery_status TEXT DEFAULT 'none',
  like_count INTEGER DEFAULT 0,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS design_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  design_id UUID REFERENCES designs(id),
  fingerprint TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(design_id, fingerprint)
);

-- Idempotent column adds for existing designs table
ALTER TABLE designs ADD COLUMN IF NOT EXISTS gallery_status TEXT DEFAULT 'none';
ALTER TABLE designs ADD COLUMN IF NOT EXISTS like_count INTEGER DEFAULT 0;
ALTER TABLE designs ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
ALTER TABLE designs ADD COLUMN IF NOT EXISTS selected_items JSONB;
ALTER TABLE designs ADD COLUMN IF NOT EXISTS original_blur TEXT;
ALTER TABLE designs ADD COLUMN IF NOT EXISTS generated_blur TEXT;
CREATE INDEX IF NOT EXISTS idx_designs_gallery ON designs (gallery_status, like_count DESC, published_at DESC);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  design_id UUID REFERENCES designs(id),
  amount_paise INTEGER NOT NULL,
  instamojo_payment_id TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS event_dates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  event_type TEXT NOT NULL,
  event_label TEXT,
  event_date DATE NOT NULL,
  honoree TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Billing: pricing + coupons (also self-initialized by src/lib/db.ts).
-- Amounts are in the smallest currency unit (paise / cents).
CREATE TABLE IF NOT EXISTS pricing (
  locale TEXT PRIMARY KEY,        -- 'IN' | 'US'
  actual_amount INTEGER NOT NULL, -- MRP, shown struck-through
  sale_amount INTEGER NOT NULL,   -- current selling price
  currency TEXT NOT NULL,         -- 'inr' | 'usd'
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  discount_type TEXT NOT NULL,    -- 'percent' | 'fixed'
  discount_value INTEGER NOT NULL,-- percent (1-100) or fixed amount in smallest unit
  locale TEXT,                    -- NULL = all regions
  active BOOLEAN DEFAULT true,
  expires_at TIMESTAMPTZ,
  max_uses INTEGER,
  used_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
