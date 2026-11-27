-- Personal Admin-to-User notifications & feedback replies (shown in header bell)

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
CREATE INDEX IF NOT EXISTS user_feedback_user_time ON user_feedback(user_id, created_at);
