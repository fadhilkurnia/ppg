-- Ported from sitrac-v3's Prisma schema (models Tingkat + MateriAjar) so the
-- kurikulum content from the production PPG curriculum can be loaded as seed
-- data. Column names follow the original camelCase (quoted) to match the
-- INSERTs in seed-data/kurikulum.sql verbatim.
--
-- Tables not ported here:
--   - MateriRaport, MateriRaportTag, MateriAjarTag, Tag (tag system)
--   - CompactAjar / HaditsKitab / HaditsBab / Hadits (library content)
-- These can be added in a later migration if needed.

CREATE TABLE tingkat (
  id     TEXT PRIMARY KEY,
  nama   TEXT NOT NULL UNIQUE,
  urutan INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_tingkat_urutan ON tingkat(urutan);

CREATE TABLE materi_ajar (
  id                  TEXT PRIMARY KEY,
  "kodeMateri"        TEXT NOT NULL UNIQUE,
  "refRaportId"       TEXT,
  tingkat             TEXT NOT NULL,
  tema                TEXT NOT NULL,
  "subTema"           TEXT NOT NULL,
  "kelompokMateri"    TEXT,
  "detailMateri"      TEXT NOT NULL,
  semester            INTEGER NOT NULL,
  kategori            TEXT NOT NULL DEFAULT 'baru'
                      CHECK (kategori IN ('baru','lanjutan','mengulang')),
  "refSourceTingkat"  TEXT,
  "refSourceKode"     TEXT,
  "perluReviewOrtu"   INTEGER NOT NULL DEFAULT 0,
  progresif           INTEGER NOT NULL DEFAULT 0,
  "libraryRelation"   TEXT
);

CREATE INDEX idx_materi_ajar_tingkat   ON materi_ajar(tingkat);
CREATE INDEX idx_materi_ajar_tema      ON materi_ajar(tema);
CREATE INDEX idx_materi_ajar_semester  ON materi_ajar(semester);
