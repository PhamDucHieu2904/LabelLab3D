PRAGMA foreign_keys = ON;

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
