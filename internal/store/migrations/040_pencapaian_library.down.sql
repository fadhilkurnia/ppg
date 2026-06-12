-- Drop library_* columns: rebuild table with the original shape. Library
-- pencapaian rows are dropped (no equivalent in the legacy schema).
CREATE TABLE pencapaian_old (
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

INSERT INTO pencapaian_old
  SELECT id, murid_user_id, materi_ajar_id, status, nilai_angka,
         nilai_huruf, tanggal, catatan, recorded_by, created_at, updated_at
    FROM pencapaian
   WHERE materi_ajar_id IS NOT NULL;

DROP TABLE pencapaian;
ALTER TABLE pencapaian_old RENAME TO pencapaian;

CREATE INDEX idx_pencapaian_murid  ON pencapaian(murid_user_id);
CREATE INDEX idx_pencapaian_materi ON pencapaian(materi_ajar_id);
CREATE INDEX idx_pencapaian_status ON pencapaian(status);
