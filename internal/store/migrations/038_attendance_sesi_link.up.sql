-- 038 — Link attendance rows back to the sesi they belong to. Set when the
-- one-shot historical importer creates a sesi from an attendance row; lets
-- the importer be re-runnable (idempotent) by skipping rows already mapped.
ALTER TABLE attendances ADD COLUMN sesi_id TEXT;
CREATE INDEX IF NOT EXISTS idx_attendances_sesi ON attendances(sesi_id);
