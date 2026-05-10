-- Drop the gender column by rebuilding without it.

DROP INDEX IF EXISTS idx_students_gender;
DROP INDEX IF EXISTS idx_students_status;
DROP INDEX IF EXISTS idx_students_kelompok;
DROP INDEX IF EXISTS idx_students_level;
DROP INDEX IF EXISTS idx_students_name;

ALTER TABLE students RENAME TO students_old_006_down;

CREATE TABLE students (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  nickname      TEXT,
  date_of_birth DATE,
  level         TEXT CHECK (level IS NULL OR level IN ('Caberawit','Pra Remaja','Remaja','Pra Nikah')),
  kelompok      TEXT CHECK (kelompok IS NULL OR kelompok IN ('California','Chicago','New Hampshire','Canada')),
  joined_at     DATE,
  left_at       DATE,
  leave_reason  TEXT,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','left')),
  parent_name   TEXT,
  parent_phone  TEXT,
  parent_email  TEXT,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO students
       (id, name, nickname, date_of_birth, level, kelompok,
        joined_at, left_at, leave_reason, status,
        parent_name, parent_phone, parent_email, created_at, updated_at)
SELECT id, name, nickname, date_of_birth, level, kelompok,
       joined_at, left_at, leave_reason, status,
       parent_name, parent_phone, parent_email, created_at, updated_at
  FROM students_old_006_down;

DROP TABLE students_old_006_down;

CREATE INDEX idx_students_name     ON students(name);
CREATE INDEX idx_students_level    ON students(level);
CREATE INDEX idx_students_kelompok ON students(kelompok);
CREATE INDEX idx_students_status   ON students(status);
