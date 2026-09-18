-- Add daerah, desa, kelompok to users table for teacher accounts
ALTER TABLE users ADD COLUMN daerah TEXT;
ALTER TABLE users ADD COLUMN desa TEXT;
ALTER TABLE users ADD COLUMN kelompok TEXT;

-- Backfill from teachers table for users whose name or nickname matches
UPDATE users
SET
  daerah = (SELECT t.daerah FROM teachers t WHERE lower(t.name) = lower(users.name) OR (t.nickname IS NOT NULL AND lower(t.nickname) = lower(users.username)) LIMIT 1),
  desa = (SELECT t.desa FROM teachers t WHERE lower(t.name) = lower(users.name) OR (t.nickname IS NOT NULL AND lower(t.nickname) = lower(users.username)) LIMIT 1),
  kelompok = (SELECT t.kelompok FROM teachers t WHERE lower(t.name) = lower(users.name) OR (t.nickname IS NOT NULL AND lower(t.nickname) = lower(users.username)) LIMIT 1)
WHERE role IN ('guru', 'teacher');
