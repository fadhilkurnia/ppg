-- Teaching plan / kehadiran: scheduled class sessions (sesi). Simplified port
-- of sitrac-v3's Sesi model — no kelas FK (GNRS doesn't model kelas yet);
-- instead we scope sessions by tingkat (string ref to tingkat.nama) and
-- optionally link to a materi_ajar row and a guru (users.id with role='guru').
--
-- tanggal stored as ISO date string "YYYY-MM-DD" (local wall-clock) to avoid
-- UTC drift on the calendar view. mulai/selesai are "HH:MM" strings, nullable
-- for sessions that don't have a fixed slot. started_at / ended_at are
-- ISO 8601 timestamps recorded when guru actually starts/ends the session.

CREATE TABLE sesi (
  id              TEXT PRIMARY KEY,
  tanggal         TEXT NOT NULL,
  mulai           TEXT,
  selesai         TEXT,
  topik           TEXT NOT NULL,
  catatan         TEXT,
  tingkat         TEXT,
  materi_ajar_id  TEXT,
  guru_id         TEXT,
  started_at      TEXT,
  ended_at        TEXT,
  created_by      TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX idx_sesi_tanggal ON sesi(tanggal);
CREATE INDEX idx_sesi_tingkat ON sesi(tingkat);
CREATE INDEX idx_sesi_guru_id ON sesi(guru_id);
CREATE INDEX idx_sesi_materi  ON sesi(materi_ajar_id);
