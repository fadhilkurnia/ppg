-- SQLite doesn't support DROP COLUMN before 3.35; recreate the table.
CREATE TABLE sesi_materi_diajarkan_old (
  id                  TEXT PRIMARY KEY,
  sesi_id             TEXT NOT NULL,
  kind                TEXT NOT NULL CHECK (kind IN ('kurikulum','quran','hadits','tilawati','doa')),
  materi_ajar_id      TEXT,
  ref                 TEXT,
  label               TEXT,
  needs_parent_review INTEGER NOT NULL DEFAULT 0,
  parent_note         TEXT,
  taught_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (sesi_id) REFERENCES sesi(id) ON DELETE CASCADE
);
INSERT INTO sesi_materi_diajarkan_old
  SELECT id, sesi_id, kind, materi_ajar_id, ref, label,
         needs_parent_review, parent_note, taught_at, created_at, updated_at
  FROM sesi_materi_diajarkan;
DROP TABLE sesi_materi_diajarkan;
ALTER TABLE sesi_materi_diajarkan_old RENAME TO sesi_materi_diajarkan;
CREATE INDEX idx_smd_sesi      ON sesi_materi_diajarkan(sesi_id, taught_at);
CREATE INDEX idx_smd_materi    ON sesi_materi_diajarkan(materi_ajar_id);
