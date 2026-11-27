-- User feedback & suggestion inbox submitted from home dashboard

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
