-- Track first-time Studio interactive tour state for newly created user accounts

CREATE TABLE IF NOT EXISTS user_onboarding (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  studio_tour_status TEXT NOT NULL DEFAULT 'pending' CHECK (studio_tour_status IN ('pending','completed','skipped')),
  updated_at TEXT NOT NULL
);
