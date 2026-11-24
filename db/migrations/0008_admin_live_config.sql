PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS site_config (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS site_events (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('pageview','studio_session','render')),
  visitor_type TEXT NOT NULL CHECK (visitor_type IN ('guest','user','bot')),
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  path TEXT NOT NULL DEFAULT '/',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS site_events_time_kind ON site_events(created_at, kind, visitor_type);
