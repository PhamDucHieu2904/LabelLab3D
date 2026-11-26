-- Legal compliance tables for Vietnam Personal Data Protection Law 91/2025/QH15,
-- Law on E-Commerce 122/2025/QH15, and e-invoice/receipt recordkeeping.

CREATE TABLE IF NOT EXISTS legal_consents (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  consent_type TEXT NOT NULL CHECK (consent_type IN ('register_email','oauth_google','checkout','cookies')),
  policy_version TEXT NOT NULL,
  accepted_at TEXT NOT NULL,
  ip_hash TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS legal_consents_user_time ON legal_consents(user_id, accepted_at);

CREATE TABLE IF NOT EXISTS order_receipts (
  order_id TEXT PRIMARY KEY REFERENCES payment_orders(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  buyer_name TEXT NOT NULL DEFAULT '',
  tax_code TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS order_receipts_user_time ON order_receipts(user_id, created_at);
