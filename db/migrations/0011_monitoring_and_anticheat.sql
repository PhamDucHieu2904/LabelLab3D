-- Per-session studio tool usage summaries (batched via sendBeacon, max 1/session)
-- for automated anti-cheat coin burn reconciliation.
CREATE TABLE IF NOT EXISTS tool_usage_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  visitor_hash TEXT NOT NULL DEFAULT '',
  renders_started INTEGER NOT NULL DEFAULT 0 CHECK (renders_started >= 0),
  renders_completed INTEGER NOT NULL DEFAULT 0 CHECK (renders_completed >= 0),
  dielines_started INTEGER NOT NULL DEFAULT 0 CHECK (dielines_started >= 0),
  dielines_completed INTEGER NOT NULL DEFAULT 0 CHECK (dielines_completed >= 0),
  expected_coins INTEGER NOT NULL DEFAULT 0 CHECK (expected_coins >= 0),
  dom_svg_copies INTEGER NOT NULL DEFAULT 0 CHECK (dom_svg_copies >= 0),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS tool_usage_sessions_user_time ON tool_usage_sessions(user_id, created_at);
CREATE INDEX IF NOT EXISTS tool_usage_sessions_time ON tool_usage_sessions(created_at);

-- Daily Cloudflare Worker request quota telemetry (batched in Worker isolate memory).
CREATE TABLE IF NOT EXISTS worker_request_daily (
  day TEXT PRIMARY KEY,
  total_requests INTEGER NOT NULL DEFAULT 0 CHECK (total_requests >= 0),
  page_requests INTEGER NOT NULL DEFAULT 0 CHECK (page_requests >= 0),
  api_requests INTEGER NOT NULL DEFAULT 0 CHECK (api_requests >= 0),
  auth_requests INTEGER NOT NULL DEFAULT 0 CHECK (auth_requests >= 0),
  blocked_requests INTEGER NOT NULL DEFAULT 0 CHECK (blocked_requests >= 0),
  updated_at TEXT NOT NULL
);

-- Per-day unique actor counters for calculating average requests per user / visitor.
CREATE TABLE IF NOT EXISTS worker_request_actors (
  day TEXT NOT NULL,
  actor_key TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('user','guest','bot')),
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (day, actor_key)
);
CREATE INDEX IF NOT EXISTS worker_request_actors_day_type ON worker_request_actors(day, actor_type);
