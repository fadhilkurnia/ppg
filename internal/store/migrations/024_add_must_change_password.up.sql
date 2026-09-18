-- Add must_change_password flag to users table
ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 1;

-- Seed admin or existing admin users should not be blocked on initial deployment
UPDATE users SET must_change_password = 0 WHERE email = 'admin@ppg.local' OR role = 'admin';
