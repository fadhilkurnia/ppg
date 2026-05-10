-- Revert to the original school-dashboard shape. Note: any rows added under
-- the PPG schema will be lost (parent_name/parent_phone become NOT NULL again
-- and there's no source for student_id/gender on existing rows).

DROP INDEX IF EXISTS idx_students_status;
DROP INDEX IF EXISTS idx_students_kelompok;
DROP INDEX IF EXISTS idx_students_level;
DROP INDEX IF EXISTS idx_students_name;
DROP TABLE IF EXISTS students;

CREATE TABLE students (
  id            TEXT PRIMARY KEY,
  student_id    TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  date_of_birth DATE NOT NULL,
  gender        TEXT NOT NULL CHECK (gender IN ('male','female')),
  address       TEXT,
  parent_name   TEXT NOT NULL,
  parent_phone  TEXT NOT NULL,
  parent_email  TEXT,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_students_name ON students(name);
