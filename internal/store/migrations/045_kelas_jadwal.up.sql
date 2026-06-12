-- 045 — Jadwal rutin per kelas (recurring weekly schedule).
--
-- One row per kelas (UNIQUE kelas_id). `hari` is a CSV of weekday integers
-- (0=Minggu..6=Sabtu) the class meets; all selected days share one mulai/
-- selesai time. The schedule lazily auto-generates individual `sesi` rows on
-- class open, up to `horizon_minggu` weeks ahead (see internal/store/jadwal.go).
-- kelas_id references kelas.id (handler-enforced, no SQL FK — house style).
CREATE TABLE kelas_jadwal (
  id             TEXT PRIMARY KEY,
  kelas_id       TEXT NOT NULL UNIQUE,
  hari           TEXT NOT NULL,
  mulai          TEXT NOT NULL,
  selesai        TEXT,
  topik_default  TEXT,
  mulai_tanggal  TEXT,
  sampai_tanggal TEXT,
  horizon_minggu INTEGER NOT NULL DEFAULT 8,
  aktif          INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_kelas_jadwal_kelas ON kelas_jadwal(kelas_id);

-- Link generated sesi back to their schedule (NULL = manually created).
ALTER TABLE sesi ADD COLUMN jadwal_id TEXT;
CREATE INDEX idx_sesi_jadwal ON sesi(jadwal_id);
CREATE INDEX idx_sesi_kelas_tanggal ON sesi(kelas_id, tanggal);
