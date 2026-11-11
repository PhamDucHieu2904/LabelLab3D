PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS coin_reservations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount INTEGER NOT NULL CHECK (amount > 0),
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('reserved','committed','released')),
  ledger_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS coin_reservations_user_status ON coin_reservations(user_id,status,created_at);
