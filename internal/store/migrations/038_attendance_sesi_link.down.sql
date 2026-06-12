DROP INDEX IF EXISTS idx_attendances_sesi;
-- SQLite < 3.35 cannot DROP COLUMN; recreate the table to remove sesi_id.
-- The deployed binary uses modernc.org/sqlite which embeds 3.46+, so the
-- newer ALTER syntax works.
ALTER TABLE attendances DROP COLUMN sesi_id;
