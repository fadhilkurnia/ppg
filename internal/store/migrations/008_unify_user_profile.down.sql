-- Best-effort down: only useful if the boot-time data migration in main.go
-- hasn't already dropped the legacy tables. Restoring the original users
-- table shape isn't attempted because SQLite < 3.35 can't drop columns and
-- the unified data would lose all the profile fields.

ALTER TABLE students_legacy_008 RENAME TO students;
ALTER TABLE teachers_legacy_008 RENAME TO teachers;

DROP INDEX IF EXISTS idx_users_membership_status;
DROP INDEX IF EXISTS idx_users_level;
DROP INDEX IF EXISTS idx_users_kelompok;
