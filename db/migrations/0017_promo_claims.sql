-- One-time promotional reward claims with atomic per-user and canonical-email uniqueness

CREATE TABLE IF NOT EXISTS promo_claims (
  promo_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_canonical_hash TEXT NOT NULL,
  coins INTEGER NOT NULL CHECK (coins > 0),
  ip_hash TEXT,
  ledger_id TEXT,
  claimed_at TEXT NOT NULL,
  PRIMARY KEY (promo_id, user_id),
  UNIQUE (promo_id, email_canonical_hash)
);
CREATE INDEX IF NOT EXISTS promo_claims_promo_ip ON promo_claims(promo_id, ip_hash, claimed_at);
