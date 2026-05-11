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

CREATE INDEX idx_attendances_date         ON attendances(date);
CREATE INDEX idx_attendances_student_date ON attendances(student_id, date);
CREATE INDEX idx_attendances_teacher_date ON attendances(teacher_id, date);
CREATE INDEX idx_attendances_status       ON attendances(status);
