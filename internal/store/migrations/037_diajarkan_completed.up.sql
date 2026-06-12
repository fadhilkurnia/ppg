-- 037 — Mark whether each materi diajarkan was actually completed before the
-- guru moved on, vs simply replaced mid-way ("ganti saja"). Helps the
-- end-sesi summary distinguish finished vs abandoned items.
ALTER TABLE sesi_materi_diajarkan ADD COLUMN completed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sesi_materi_diajarkan ADD COLUMN completed_at TEXT;
