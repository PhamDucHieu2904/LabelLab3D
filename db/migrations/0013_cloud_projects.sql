-- Cloud-synced User Projects with 30-day TTL, auto-expiry GC, and 10-coin +30d renewal

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
