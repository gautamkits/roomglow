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
  created_at TIMESTAMPTZ DEFAULT now()
);

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
