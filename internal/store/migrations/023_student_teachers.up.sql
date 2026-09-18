-- Multi-to-multi relation between students and teachers
CREATE TABLE IF NOT EXISTS student_teachers (
  id          TEXT PRIMARY KEY,
  student_id  TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  teacher_id  TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  notes       TEXT,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(student_id, teacher_id)
);

CREATE INDEX IF NOT EXISTS idx_student_teachers_student ON student_teachers(student_id);
CREATE INDEX IF NOT EXISTS idx_student_teachers_teacher ON student_teachers(teacher_id);
