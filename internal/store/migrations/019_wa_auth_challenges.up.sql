CREATE TABLE IF NOT EXISTS wa_auth_challenges (
  code TEXT PRIMARY KEY,
  poll_token TEXT NOT NULL,
  phone TEXT,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'consumed')),
  magic_token TEXT UNIQUE,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_wa_challenges_magic_token ON wa_auth_challenges(magic_token);
CREATE INDEX IF NOT EXISTS idx_wa_challenges_poll ON wa_auth_challenges(code, poll_token);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
