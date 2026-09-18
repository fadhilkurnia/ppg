-- Multi-phone support per user
CREATE TABLE IF NOT EXISTS user_phones (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0,
  verified_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_user_phones_user ON user_phones(user_id);
CREATE INDEX IF NOT EXISTS idx_user_phones_phone ON user_phones(phone);

-- Backfill existing phone numbers from users table into user_phones
INSERT OR IGNORE INTO user_phones (id, user_id, phone, is_primary, verified_at, created_at)
SELECT 'ph_' || id, id, phone, 1, created_at, created_at
FROM users
WHERE phone IS NOT NULL AND trim(phone) != '';

-- Password reset OTP challenges
CREATE TABLE IF NOT EXISTS password_reset_challenges (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  otp_code TEXT NOT NULL,
  phone TEXT NOT NULL,
  reset_token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'consumed')),
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pw_resets_token ON password_reset_challenges(reset_token);
CREATE INDEX IF NOT EXISTS idx_pw_resets_user ON password_reset_challenges(user_id);

-- WhatsApp outbox queue for automated messaging / OTP delivery
CREATE TABLE IF NOT EXISTS wa_outbox (
  id TEXT PRIMARY KEY,
  phone TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  error TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_wa_outbox_status ON wa_outbox(status);
