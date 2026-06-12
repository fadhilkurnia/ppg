-- Recreate the table with the original CHECK set. Any 'alfa' rows are
-- coerced to 'izin_murid' (best-effort fallback).
CREATE TABLE attendances_new (
  id           TEXT PRIMARY KEY,
  date         DATE NOT NULL,
  duration_min INTEGER,
  teacher_id   TEXT NOT NULL,
  student_id   TEXT NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('hadir','izin_murid','izin_guru','by_vn')),
  materi       TEXT,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sesi_id      TEXT
);

INSERT INTO attendances_new
  SELECT id, date, duration_min, teacher_id, student_id,
         CASE WHEN status = 'alfa' THEN 'izin_murid' ELSE status END,
         materi, created_at, updated_at, sesi_id
    FROM attendances;

DROP TABLE attendances;
ALTER TABLE attendances_new RENAME TO attendances;

CREATE INDEX idx_attendances_date         ON attendances(date);
CREATE INDEX idx_attendances_student_date ON attendances(student_id, date);
CREATE INDEX idx_attendances_teacher_date ON attendances(teacher_id, date);
CREATE INDEX idx_attendances_status       ON attendances(status);
CREATE INDEX idx_attendances_sesi         ON attendances(sesi_id);
