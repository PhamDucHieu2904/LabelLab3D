-- Interactive 3D Client Review Share Links (multi-item projects: bottles/cans + CAD boxes/trays)

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
