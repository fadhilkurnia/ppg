-- Pencapaian Notes & History Log
CREATE TABLE pencapaian_notes (
  id             TEXT PRIMARY KEY,
  student_id     TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  materi_ajar_id TEXT NOT NULL REFERENCES materi_ajar(id) ON DELETE CASCADE,
  note           TEXT NOT NULL,
  status         TEXT,
  nilai_angka    INTEGER,
  author_id      TEXT REFERENCES users(id),
  author_name    TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX idx_pencapaian_notes_target ON pencapaian_notes(student_id, materi_ajar_id, created_at DESC);

-- Backfill legacy catatan from pencapaian table if any exists
INSERT INTO pencapaian_notes (id, student_id, materi_ajar_id, note, status, nilai_angka, author_id, author_name, created_at)
SELECT 
  'legacy_' || p.id,
  p.student_id,
  p.materi_ajar_id,
  p.catatan,
  p.status,
  p.nilai_angka,
  p.recorded_by,
  COALESCE(u.name, 'Guru'),
  p.updated_at
FROM pencapaian p
LEFT JOIN users u ON u.id = p.recorded_by
WHERE p.catatan IS NOT NULL AND trim(p.catatan) != '';
