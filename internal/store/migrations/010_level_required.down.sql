-- Revert level back to nullable. Same snapshot/restore dance for
-- attendances as the up migration — see comments there.

CREATE TEMP TABLE attendances_backup_010_down AS SELECT * FROM attendances;

DROP INDEX IF EXISTS idx_attendances_status;
DROP INDEX IF EXISTS idx_attendances_teacher_date;
DROP INDEX IF EXISTS idx_attendances_student_date;
DROP INDEX IF EXISTS idx_attendances_date;
DROP TABLE attendances;

DROP INDEX IF EXISTS idx_students_gender;
DROP INDEX IF EXISTS idx_students_status;
DROP INDEX IF EXISTS idx_students_kelompok;
DROP INDEX IF EXISTS idx_students_level;
DROP INDEX IF EXISTS idx_students_city;
DROP INDEX IF EXISTS idx_students_name;

ALTER TABLE students RENAME TO students_old_010_down;

CREATE TABLE students (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  nickname      TEXT,
  date_of_birth DATE,
  gender        TEXT NOT NULL CHECK (gender IN ('male','female')),
  level         TEXT CHECK (level IS NULL OR level IN ('Caberawit','Pra Remaja','Remaja','Pra Nikah')),
  kelompok      TEXT NOT NULL CHECK (kelompok IN ('California','Chicago','New Hampshire','Canada')),
  city          TEXT,
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
       (id, name, nickname, date_of_birth, gender, level, kelompok, city,
        joined_at, left_at, leave_reason, status,
        parent_name, parent_phone, parent_email, created_at, updated_at)
SELECT id, name, nickname, date_of_birth, gender, level, kelompok, city,
       joined_at, left_at, leave_reason, status,
       parent_name, parent_phone, parent_email, created_at, updated_at
  FROM students_old_010_down;

DROP TABLE students_old_010_down;

CREATE INDEX idx_students_name     ON students(name);
CREATE INDEX idx_students_level    ON students(level);
CREATE INDEX idx_students_kelompok ON students(kelompok);
CREATE INDEX idx_students_city     ON students(city);
CREATE INDEX idx_students_status   ON students(status);
CREATE INDEX idx_students_gender   ON students(gender);

CREATE TABLE attendances (
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

INSERT INTO attendances SELECT * FROM attendances_backup_010_down;
DROP TABLE attendances_backup_010_down;

CREATE INDEX idx_attendances_date         ON attendances(date);
CREATE INDEX idx_attendances_student_date ON attendances(student_id, date);
CREATE INDEX idx_attendances_teacher_date ON attendances(teacher_id, date);
CREATE INDEX idx_attendances_status       ON attendances(status);
