-- 027 — Pencapaian (achievement / mastery record per murid × materi).
--
-- A row tracks one murid's status on one materi_ajar item. A single murid
-- can only have one active record per materi; status can flow
-- belum → proses → tuntas. Records are owned by the materi.tingkat (umur)
-- via the join, which the UI uses for the age-range filter.

CREATE TABLE pencapaian (
  id              TEXT PRIMARY KEY,
  murid_user_id   TEXT NOT NULL,
  materi_ajar_id  TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'belum'
                  CHECK (status IN ('belum','proses','tuntas')),
  nilai_angka     INTEGER,
  nilai_huruf     TEXT,
  tanggal         TEXT,
  catatan         TEXT,
  recorded_by     TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(murid_user_id, materi_ajar_id)
);

CREATE INDEX idx_pencapaian_murid     ON pencapaian(murid_user_id);
CREATE INDEX idx_pencapaian_materi    ON pencapaian(materi_ajar_id);
CREATE INDEX idx_pencapaian_status    ON pencapaian(status);
