PRAGMA foreign_keys = OFF;

CREATE TABLE payment_orders_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL CHECK (provider IN ('sepay','polar')),
  order_code TEXT NOT NULL UNIQUE,
  package_coins INTEGER NOT NULL CHECK (package_coins > 0),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL CHECK (currency IN ('VND','USD')),
  status TEXT NOT NULL CHECK (status IN ('pending','paid','expired','cancelled','refunded')),
  provider_order_id TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO payment_orders_new (id,user_id,provider,order_code,package_coins,amount_minor,currency,status,provider_order_id,expires_at,created_at,updated_at)
SELECT id,user_id,provider,order_code,package_coins,amount_minor,currency,status,provider_order_id,expires_at,created_at,updated_at FROM payment_orders;

CREATE TABLE payment_events_new (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('sepay','polar')),
  provider_event_id TEXT NOT NULL,
  order_id TEXT REFERENCES payment_orders_new(id) ON DELETE SET NULL,
  raw_payload_hash TEXT NOT NULL,
  signature_valid INTEGER NOT NULL CHECK (signature_valid IN (0,1)),
  processing_status TEXT NOT NULL CHECK (processing_status IN ('received','processed','ignored','rejected')),
  created_at TEXT NOT NULL,
  UNIQUE(provider,provider_event_id)
);

INSERT INTO payment_events_new (id,provider,provider_event_id,order_id,raw_payload_hash,signature_valid,processing_status,created_at)
SELECT id,provider,provider_event_id,order_id,raw_payload_hash,signature_valid,processing_status,created_at FROM payment_events;

DROP TABLE payment_events;
DROP TABLE payment_orders;

ALTER TABLE payment_orders_new RENAME TO payment_orders;
ALTER TABLE payment_events_new RENAME TO payment_events;

CREATE INDEX IF NOT EXISTS payment_orders_user_time ON payment_orders(user_id,created_at);
CREATE INDEX IF NOT EXISTS payment_orders_status_expiry ON payment_orders(status,expires_at);
CREATE INDEX IF NOT EXISTS payment_events_order_time ON payment_events(order_id,created_at);

PRAGMA foreign_keys = ON;
