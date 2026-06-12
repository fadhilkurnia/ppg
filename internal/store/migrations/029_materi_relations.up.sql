-- 029 — Kurikulum relations: many-to-many library refs and same-content
-- relations between materi_ajar rows.
--
-- materi_library_ref: connects a materi_ajar to one or more library items
-- (quran ayat / hadits / tilawati page / doa). When the library item gets
-- completed (e.g. a bacaan log is recorded for that ayat), the linked
-- kurikulum materi auto-flips its pencapaian status to "tuntas".
--
-- materi_relation: connects two materi_ajar rows that represent the same
-- content at different umur levels. Marking one as tuntas can propagate to
-- its relatives (application logic decides; the table is just the graph).

CREATE TABLE materi_library_ref (
  id              TEXT PRIMARY KEY,
  materi_ajar_id  TEXT NOT NULL,
  library_kind    TEXT NOT NULL CHECK (library_kind IN ('quran','hadits','tilawati','doa')),
  library_aspect  TEXT,
  library_ref     TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(materi_ajar_id, library_kind, library_aspect, library_ref)
);

CREATE INDEX idx_mlr_materi  ON materi_library_ref(materi_ajar_id);
CREATE INDEX idx_mlr_library ON materi_library_ref(library_kind, library_ref);

CREATE TABLE materi_relation (
  -- Pair is stored canonical (a < b) to keep the relation symmetric and
  -- prevent (a,b) and (b,a) duplicates.
  materi_a_id     TEXT NOT NULL,
  materi_b_id     TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (materi_a_id, materi_b_id),
  CHECK (materi_a_id < materi_b_id)
);

CREATE INDEX idx_mrel_a ON materi_relation(materi_a_id);
CREATE INDEX idx_mrel_b ON materi_relation(materi_b_id);
