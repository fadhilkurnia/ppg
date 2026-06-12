-- 024 — Multiple guru per kelas.
--
-- Previously `kelas.guru_user_id` carried a single guru. The "Kelas saya"
-- filter for guru users now needs to recognise every guru assigned to a
-- kelas, not just the primary one. We introduce a join table and backfill
-- it from the legacy column; the legacy column is kept for back-compat and
-- treated as the primary/wali guru.

CREATE TABLE kelas_guru (
  kelas_id      TEXT NOT NULL,
  guru_user_id  TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (kelas_id, guru_user_id)
);

CREATE INDEX idx_kelas_guru_guru ON kelas_guru(guru_user_id);

-- Backfill: every existing kelas with a non-null guru_user_id gets a row.
INSERT OR IGNORE INTO kelas_guru (kelas_id, guru_user_id)
SELECT id, guru_user_id FROM kelas WHERE guru_user_id IS NOT NULL;
