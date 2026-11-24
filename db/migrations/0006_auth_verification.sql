PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS email_verification_codes (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE,
  purpose TEXT NOT NULL CHECK (purpose IN ('register','reset')),
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS email_verification_lookup ON email_verification_codes(email,purpose,created_at);

CREATE TABLE IF NOT EXISTS oauth_accounts (
  provider TEXT NOT NULL CHECK (provider IN ('google')),
  provider_subject TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL COLLATE NOCASE,
  avatar_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (provider, provider_subject)
);
CREATE INDEX IF NOT EXISTS oauth_accounts_user ON oauth_accounts(user_id);
