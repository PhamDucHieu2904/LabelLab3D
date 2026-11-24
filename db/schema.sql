PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, name TEXT NOT NULL,
  password_hash TEXT, role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','locked')),
  email_verified_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_token_expiry ON sessions(token_hash,expires_at);
CREATE TABLE IF NOT EXISTS auth_rate_limits (
  scope TEXT PRIMARY KEY,
  failures INTEGER NOT NULL DEFAULT 0 CHECK (failures >= 0),
  locked_until TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_rate_limits_lock ON auth_rate_limits(locked_until);
CREATE TABLE IF NOT EXISTS coin_ledger (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount INTEGER NOT NULL CHECK (amount <> 0), kind TEXT NOT NULL, reference TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE, balance INTEGER NOT NULL CHECK (balance >= 0),
  metadata_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS coin_ledger_user_time ON coin_ledger(user_id,created_at);
CREATE TABLE IF NOT EXISTS coin_reservations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount INTEGER NOT NULL CHECK (amount > 0),
  reference TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('reserved','committed','released')),
  ledger_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS coin_reservations_user_status ON coin_reservations(user_id,status,created_at);
CREATE TABLE IF NOT EXISTS wallets (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0), updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS daily_checkins (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL, coins INTEGER NOT NULL CHECK (coins > 0), idempotency_key TEXT NOT NULL UNIQUE, claimed_at TEXT NOT NULL,
  UNIQUE(user_id,day)
);
CREATE TABLE IF NOT EXISTS badges (
  id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL, description TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS user_badges (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, badge_id TEXT NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
  awarded_at TEXT NOT NULL, metadata_json TEXT NOT NULL DEFAULT '{}', PRIMARY KEY(user_id,badge_id)
);
CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY, actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL, action TEXT NOT NULL,
  target_type TEXT NOT NULL, target_id TEXT, ip_hash TEXT, metadata_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
);

-- Payment orders are server-authoritative snapshots of a coin package. A
-- provider may be retried without changing the package or amount attached to
-- the logical order.
CREATE TABLE IF NOT EXISTS payment_orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL CHECK (provider IN ('sepay')),
  order_code TEXT NOT NULL UNIQUE,
  package_coins INTEGER NOT NULL CHECK (package_coins > 0),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL CHECK (currency = 'VND'),
  status TEXT NOT NULL CHECK (status IN ('pending','paid','expired','cancelled','refunded')),
  provider_order_id TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS payment_orders_user_time ON payment_orders(user_id,created_at);
CREATE INDEX IF NOT EXISTS payment_orders_status_expiry ON payment_orders(status,expires_at);

CREATE TABLE IF NOT EXISTS payment_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('sepay')),
  provider_event_id TEXT NOT NULL,
  order_id TEXT REFERENCES payment_orders(id) ON DELETE SET NULL,
  raw_payload_hash TEXT NOT NULL,
  signature_valid INTEGER NOT NULL CHECK (signature_valid IN (0,1)),
  processing_status TEXT NOT NULL CHECK (processing_status IN ('received','processed','ignored','rejected')),
  created_at TEXT NOT NULL,
  UNIQUE(provider,provider_event_id)
);
CREATE INDEX IF NOT EXISTS payment_events_order_time ON payment_events(order_id,created_at);
