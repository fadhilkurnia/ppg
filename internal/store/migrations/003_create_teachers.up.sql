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

CREATE INDEX idx_teachers_name     ON teachers(name);
CREATE INDEX idx_teachers_status   ON teachers(status);
CREATE INDEX idx_teachers_daerah   ON teachers(daerah);
CREATE INDEX idx_teachers_desa     ON teachers(desa);
CREATE INDEX idx_teachers_kelompok ON teachers(kelompok);
