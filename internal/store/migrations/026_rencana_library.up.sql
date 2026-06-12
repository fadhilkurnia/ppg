-- 026 — Allow library-sourced items in rencana_bulanan_item.
--
-- Previously every rencana item referenced a materi_ajar_id (NOT NULL).
-- We now want to plan library-sourced content too (Quran ayat range,
-- hadits ref, tilawati pages, doa) without forcing it through kurikulum.
-- We add library_kind/library_aspect/library_ref columns and relax the
-- NOT NULL constraint on materi_ajar_id via SQLite's create-copy-rename.

ALTER TABLE rencana_bulanan_item ADD COLUMN library_kind   TEXT NULL;
ALTER TABLE rencana_bulanan_item ADD COLUMN library_aspect TEXT NULL;
ALTER TABLE rencana_bulanan_item ADD COLUMN library_ref    TEXT NULL;

-- Re-create the table to drop NOT NULL on materi_ajar_id and relax the
-- UNIQUE(rencana_id, materi_ajar_id) constraint (library items have null
-- materi_ajar_id and rely on library_ref for uniqueness).
CREATE TABLE rencana_bulanan_item_new (
  id              TEXT PRIMARY KEY,
  rencana_id      TEXT NOT NULL,
  materi_ajar_id  TEXT,
  library_kind    TEXT,
  library_aspect  TEXT,
  library_ref     TEXT,
  urutan          INTEGER NOT NULL DEFAULT 0,
  selesai         INTEGER NOT NULL DEFAULT 0,
  tanggal_selesai TEXT,
  catatan         TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

INSERT INTO rencana_bulanan_item_new
  (id, rencana_id, materi_ajar_id, library_kind, library_aspect, library_ref,
   urutan, selesai, tanggal_selesai, catatan, created_at, updated_at)
SELECT id, rencana_id, materi_ajar_id, library_kind, library_aspect, library_ref,
       urutan, selesai, tanggal_selesai, catatan, created_at, updated_at
FROM rencana_bulanan_item;

DROP TABLE rencana_bulanan_item;
ALTER TABLE rencana_bulanan_item_new RENAME TO rencana_bulanan_item;

CREATE INDEX idx_rencana_item_rencana ON rencana_bulanan_item(rencana_id);
CREATE INDEX idx_rencana_item_materi  ON rencana_bulanan_item(materi_ajar_id);
CREATE INDEX idx_rencana_item_library ON rencana_bulanan_item(library_kind);
