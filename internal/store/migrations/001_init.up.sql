CREATE TABLE users (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  password    TEXT NOT NULL,
  name        TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin','staff')),
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

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
