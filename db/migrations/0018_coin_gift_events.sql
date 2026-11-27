PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS coin_gift_events (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  coins_per_user INTEGER NOT NULL CHECK (coins_per_user > 0),
  recipient_count INTEGER NOT NULL DEFAULT 0 CHECK (recipient_count >= 0),
  total_coins_distributed INTEGER NOT NULL DEFAULT 0 CHECK (total_coins_distributed >= 0),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS coin_gift_events_created_at ON coin_gift_events(created_at);
