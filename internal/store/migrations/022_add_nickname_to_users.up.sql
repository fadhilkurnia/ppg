-- Add nickname to users table
ALTER TABLE users ADD COLUMN nickname TEXT;

-- Backfill nickname from teachers table for teacher accounts
UPDATE users
SET nickname = (
  SELECT t.nickname FROM teachers t
  WHERE lower(t.name) = lower(users.name)
     OR (t.nickname IS NOT NULL AND lower(t.nickname) = lower(users.username))
  LIMIT 1
)
WHERE role IN ('guru', 'teacher');
