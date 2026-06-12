-- 025 — Allow multiple kurikulum materi per sesi.
--
-- Previously sesi.materi_ajar_id carried a single materi. The Tambah-sesi
-- flow now wants a "+" button to add multiple kurikulum materi per sesi.
-- We introduce a join table and backfill from the legacy single column.
-- The single column is kept for back-compat (and treated as the primary
-- materi in legacy code paths).

CREATE TABLE sesi_materi (
  sesi_id        TEXT NOT NULL,
  materi_ajar_id TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (sesi_id, materi_ajar_id)
);

CREATE INDEX idx_sesi_materi_materi ON sesi_materi(materi_ajar_id);

INSERT OR IGNORE INTO sesi_materi (sesi_id, materi_ajar_id)
SELECT id, materi_ajar_id FROM sesi WHERE materi_ajar_id IS NOT NULL;
