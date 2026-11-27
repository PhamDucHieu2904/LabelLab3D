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
CREATE INDEX IF NOT EXISTS payment_orders_user_time ON payment_orders(user_id,created_at);
CREATE INDEX IF NOT EXISTS payment_orders_status_expiry ON payment_orders(status,expires_at);

CREATE TABLE IF NOT EXISTS payment_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('sepay','polar')),
  provider_event_id TEXT NOT NULL,
  order_id TEXT REFERENCES payment_orders(id) ON DELETE SET NULL,
  raw_payload_hash TEXT NOT NULL,
  signature_valid INTEGER NOT NULL CHECK (signature_valid IN (0,1)),
  processing_status TEXT NOT NULL CHECK (processing_status IN ('received','processed','ignored','rejected')),
  created_at TEXT NOT NULL,
  UNIQUE(provider,provider_event_id)
);
CREATE INDEX IF NOT EXISTS payment_events_order_time ON payment_events(order_id,created_at);

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

CREATE TABLE IF NOT EXISTS worker_request_daily (
  day TEXT PRIMARY KEY,
  total_requests INTEGER NOT NULL DEFAULT 0 CHECK (total_requests >= 0),
  page_requests INTEGER NOT NULL DEFAULT 0 CHECK (page_requests >= 0),
  api_requests INTEGER NOT NULL DEFAULT 0 CHECK (api_requests >= 0),
  auth_requests INTEGER NOT NULL DEFAULT 0 CHECK (auth_requests >= 0),
  blocked_requests INTEGER NOT NULL DEFAULT 0 CHECK (blocked_requests >= 0),
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS worker_request_actors (
  day TEXT NOT NULL,
  actor_key TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('user','guest','bot')),
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (day, actor_key)
);
CREATE INDEX IF NOT EXISTS worker_request_actors_day_type ON worker_request_actors(day, actor_type);

CREATE TABLE IF NOT EXISTS shared_projects (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  local_project_id TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  brand_name TEXT NOT NULL DEFAULT '',
  passcode_hash TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','revoked')),
  options_json TEXT NOT NULL DEFAULT '{}',
  item_count INTEGER NOT NULL DEFAULT 0 CHECK (item_count >= 0),
  total_bytes INTEGER NOT NULL DEFAULT 0 CHECK (total_bytes >= 0),
  view_count INTEGER NOT NULL DEFAULT 0 CHECK (view_count >= 0),
  last_viewed_at TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS shared_projects_user_time ON shared_projects(user_id, updated_at);
CREATE INDEX IF NOT EXISTS shared_projects_token ON shared_projects(token);

CREATE TABLE IF NOT EXISTS shared_project_items (
  id TEXT PRIMARY KEY,
  share_id TEXT NOT NULL REFERENCES shared_projects(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('beverage','packaging')),
  subtitle TEXT NOT NULL DEFAULT '',
  thumbnail_hash TEXT,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS shared_project_items_order ON shared_project_items(share_id, sort_order);

CREATE TABLE IF NOT EXISTS shared_assets (
  content_hash TEXT PRIMARY KEY,
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size > 0),
  width INTEGER NOT NULL DEFAULT 0,
  height INTEGER NOT NULL DEFAULT 0,
  storage_backend TEXT NOT NULL CHECK (storage_backend IN ('r2','d1')),
  r2_key TEXT,
  ref_count INTEGER NOT NULL DEFAULT 1 CHECK (ref_count >= 0),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shared_asset_blobs (
  content_hash TEXT PRIMARY KEY REFERENCES shared_assets(content_hash) ON DELETE CASCADE,
  data BLOB NOT NULL
);

CREATE TABLE IF NOT EXISTS cloud_projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  brand_name TEXT NOT NULL DEFAULT '',
  item_count INTEGER NOT NULL DEFAULT 0 CHECK (item_count >= 0),
  total_bytes INTEGER NOT NULL DEFAULT 0 CHECK (total_bytes >= 0),
  auto_renew INTEGER NOT NULL DEFAULT 0 CHECK (auto_renew IN (0, 1)),
  renewal_count INTEGER NOT NULL DEFAULT 0 CHECK (renewal_count >= 0),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS cloud_projects_user_time ON cloud_projects(user_id, updated_at);
CREATE INDEX IF NOT EXISTS cloud_projects_expiry ON cloud_projects(expires_at);

CREATE TABLE IF NOT EXISTS cloud_project_items (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES cloud_projects(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('beverage','packaging')),
  subtitle TEXT NOT NULL DEFAULT '',
  thumbnail_hash TEXT,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS cloud_project_items_order ON cloud_project_items(project_id, sort_order);

CREATE TABLE IF NOT EXISTS user_feedback (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  sender_name TEXT NOT NULL DEFAULT '',
  sender_email TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'suggestion' CHECK (category IN ('suggestion','bug','model_request','other')),
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','read','resolved','archived')),
  admin_note TEXT NOT NULL DEFAULT '',
  page_path TEXT NOT NULL DEFAULT '/',
  locale TEXT NOT NULL DEFAULT 'vi',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS user_feedback_status_time ON user_feedback(status, created_at);
CREATE INDEX IF NOT EXISTS user_feedback_created_at ON user_feedback(created_at);
CREATE INDEX IF NOT EXISTS user_feedback_user_time ON user_feedback(user_id, created_at);

CREATE TABLE IF NOT EXISTS user_notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_admin_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  kind TEXT NOT NULL DEFAULT 'admin_message' CHECK (kind IN ('admin_message','feedback_reply','system')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  feedback_id TEXT REFERENCES user_feedback(id) ON DELETE SET NULL,
  read_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS user_notifications_user_time ON user_notifications(user_id, created_at);
CREATE INDEX IF NOT EXISTS user_notifications_user_unread ON user_notifications(user_id, read_at);
CREATE INDEX IF NOT EXISTS user_notifications_feedback ON user_notifications(feedback_id, created_at);
