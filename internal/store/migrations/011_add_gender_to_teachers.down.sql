-- Reverse 011_add_gender_to_teachers.

DROP INDEX IF EXISTS idx_teachers_gender;

-- SQLite doesn't support DROP COLUMN before 3.35; do a table rebuild.
ALTER TABLE teachers RENAME TO teachers_old_011;

CREATE TABLE teachers (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  nickname    TEXT,
  kelompok    TEXT NOT NULL,
  desa        TEXT NOT NULL,
  daerah      TEXT NOT NULL,
  joined_at   DATE,
  retired_at  DATE,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','retired')),
  notes       TEXT,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO teachers
       (id, name, nickname, kelompok, desa, daerah, joined_at, retired_at,
        status, notes, created_at, updated_at)
SELECT id, name, nickname, kelompok, desa, daerah, joined_at, retired_at,
       status, notes, created_at, updated_at
  FROM teachers_old_011;

DROP TABLE teachers_old_011;

CREATE INDEX idx_teachers_name     ON teachers(name);
CREATE INDEX idx_teachers_status   ON teachers(status);
CREATE INDEX idx_teachers_daerah   ON teachers(daerah);
CREATE INDEX idx_teachers_desa     ON teachers(desa);
CREATE INDEX idx_teachers_kelompok ON teachers(kelompok);
