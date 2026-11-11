PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  scope TEXT PRIMARY KEY,
  failures INTEGER NOT NULL DEFAULT 0 CHECK (failures >= 0),
  locked_until TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_rate_limits_lock ON auth_rate_limits(locked_until);
