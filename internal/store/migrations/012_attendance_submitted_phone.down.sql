-- SQLite (pre-3.35) cannot DROP COLUMN; rebuild the table to mirror the
-- shape from 009_create_attendances.up.sql.

DROP INDEX IF EXISTS idx_attendances_status;
DROP INDEX IF EXISTS idx_attendances_teacher_date;
DROP INDEX IF EXISTS idx_attendances_student_date;
DROP INDEX IF EXISTS idx_attendances_date;

CREATE TABLE attendances_new (
  id           TEXT PRIMARY KEY,
  date         DATE NOT NULL,
  duration_min INTEGER,
  teacher_id   TEXT NOT NULL REFERENCES teachers(id) ON DELETE RESTRICT,
  student_id   TEXT NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  status       TEXT NOT NULL CHECK (status IN ('hadir','izin_murid','izin_guru','by_vn')),
  materi       TEXT,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO attendances_new
  (id, date, duration_min, teacher_id, student_id, status, materi, created_at, updated_at)
SELECT
  id, date, duration_min, teacher_id, student_id, status, materi, created_at, updated_at
FROM attendances;

DROP TABLE attendances;
ALTER TABLE attendances_new RENAME TO attendances;

CREATE INDEX idx_attendances_date         ON attendances(date);
CREATE INDEX idx_attendances_student_date ON attendances(student_id, date);
CREATE INDEX idx_attendances_teacher_date ON attendances(teacher_id, date);
CREATE INDEX idx_attendances_status       ON attendances(status);
