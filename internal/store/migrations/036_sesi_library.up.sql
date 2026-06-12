-- 036 — Multi-library refs per sesi. Lets a single sesi attach more than one
-- non-kurikulum library item (e.g. two Quran ranges + one Hadits row), in
-- addition to the existing many-to-many `sesi_materi` for kurikulum items.
-- The legacy single-shot library_kind/library_aspect/library_ref columns on
-- `sesi` remain for now (backward compat); the join table is authoritative
-- going forward.
CREATE TABLE sesi_library (
  id             TEXT PRIMARY KEY,
  sesi_id        TEXT NOT NULL,
  library_kind   TEXT NOT NULL CHECK (library_kind IN ('quran','hadits','tilawati','doa')),
  library_aspect TEXT,
  library_ref    TEXT NOT NULL,
  position       INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (sesi_id) REFERENCES sesi(id) ON DELETE CASCADE
);
CREATE INDEX idx_sesi_library_sesi ON sesi_library(sesi_id, position);
