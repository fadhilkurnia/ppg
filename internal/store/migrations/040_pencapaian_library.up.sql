-- 040 — Widen `pencapaian` to also track library refs (Quran / Hadits /
-- Tilawati / Doa), not just kurikulum materi_ajar. Each row is either a
-- "kurikulum entry" (materi_ajar_id non-null) OR a "library entry"
-- (library_kind + library_ref non-null), enforced by a CHECK constraint.
-- The pair (murid, materi_ajar_id) and (murid, library_kind, library_aspect,
-- library_ref) remain unique respectively. Existing rows are preserved as
-- kurikulum entries.

CREATE TABLE pencapaian_new (
  id              TEXT PRIMARY KEY,
  murid_user_id   TEXT NOT NULL,
  materi_ajar_id  TEXT,
  library_kind    TEXT CHECK (library_kind IS NULL OR library_kind IN ('quran','hadits','tilawati','doa')),
  library_aspect  TEXT CHECK (library_aspect IS NULL OR library_aspect IN ('reciting','memorizing','review','manqul')),
  library_ref     TEXT,
  status          TEXT NOT NULL DEFAULT 'belum'
                  CHECK (status IN ('belum','proses','tuntas')),
  nilai_angka     INTEGER,
  nilai_huruf     TEXT,
  tanggal         TEXT,
  catatan         TEXT,
  recorded_by     TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  -- Exactly one of (materi_ajar_id) or (library_kind+library_ref) is set.
  CHECK (
    (materi_ajar_id IS NOT NULL AND library_kind IS NULL AND library_ref IS NULL)
    OR
    (materi_ajar_id IS NULL AND library_kind IS NOT NULL AND library_ref IS NOT NULL)
  )
);

INSERT INTO pencapaian_new
  (id, murid_user_id, materi_ajar_id, status, nilai_angka,
   nilai_huruf, tanggal, catatan, recorded_by, created_at, updated_at)
  SELECT id, murid_user_id, materi_ajar_id, status, nilai_angka,
         nilai_huruf, tanggal, catatan, recorded_by, created_at, updated_at
    FROM pencapaian;

DROP TABLE pencapaian;
ALTER TABLE pencapaian_new RENAME TO pencapaian;

CREATE INDEX idx_pencapaian_murid     ON pencapaian(murid_user_id);
CREATE INDEX idx_pencapaian_materi    ON pencapaian(materi_ajar_id) WHERE materi_ajar_id IS NOT NULL;
CREATE INDEX idx_pencapaian_library   ON pencapaian(library_kind, library_ref) WHERE library_kind IS NOT NULL;
CREATE INDEX idx_pencapaian_status    ON pencapaian(status);
CREATE UNIQUE INDEX idx_pencapaian_murid_materi
  ON pencapaian(murid_user_id, materi_ajar_id)
  WHERE materi_ajar_id IS NOT NULL;
CREATE UNIQUE INDEX idx_pencapaian_murid_library
  ON pencapaian(murid_user_id, library_kind, COALESCE(library_aspect, ''), library_ref)
  WHERE library_kind IS NOT NULL;
