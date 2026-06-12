-- Best-effort down: drop indices and library columns. Existing library-only
-- rows will be lost on the table rewrite, so the down migration deletes
-- them first to preserve the NOT NULL invariant.
DELETE FROM rencana_bulanan_item WHERE materi_ajar_id IS NULL;

DROP INDEX IF EXISTS idx_rencana_item_library;
DROP INDEX IF EXISTS idx_rencana_item_materi;
DROP INDEX IF EXISTS idx_rencana_item_rencana;

CREATE TABLE rencana_bulanan_item_new (
  id              TEXT PRIMARY KEY,
  rencana_id      TEXT NOT NULL,
  materi_ajar_id  TEXT NOT NULL,
  urutan          INTEGER NOT NULL DEFAULT 0,
  selesai         INTEGER NOT NULL DEFAULT 0,
  tanggal_selesai TEXT,
  catatan         TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(rencana_id, materi_ajar_id)
);

INSERT INTO rencana_bulanan_item_new
  (id, rencana_id, materi_ajar_id, urutan, selesai, tanggal_selesai, catatan, created_at, updated_at)
SELECT id, rencana_id, materi_ajar_id, urutan, selesai, tanggal_selesai, catatan, created_at, updated_at
FROM rencana_bulanan_item;

DROP TABLE rencana_bulanan_item;
ALTER TABLE rencana_bulanan_item_new RENAME TO rencana_bulanan_item;

CREATE INDEX idx_rencana_item_rencana ON rencana_bulanan_item(rencana_id);
CREATE INDEX idx_rencana_item_materi  ON rencana_bulanan_item(materi_ajar_id);
