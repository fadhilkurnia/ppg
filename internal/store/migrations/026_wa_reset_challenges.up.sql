CREATE TABLE IF NOT EXISTS wa_reset_challenges (
  code TEXT PRIMARY KEY,
  poll_token TEXT NOT NULL,
  phone TEXT,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  otp_code TEXT,
  reset_session_token TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'otp_sent', 'verified', 'consumed')),
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_wa_reset_poll ON wa_reset_challenges(code, poll_token);
CREATE INDEX IF NOT EXISTS idx_wa_reset_session ON wa_reset_challenges(reset_session_token);
CREATE INDEX IF NOT EXISTS idx_wa_reset_user ON wa_reset_challenges(user_id);
