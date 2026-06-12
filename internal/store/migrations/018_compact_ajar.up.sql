-- Compact Ajar — small library of doa, hafalan, asmaul husna entries.
-- Ported verbatim from sitrac-v3's CompactAjar table (74 rows in the seed).
-- We keep the same column names as the source for easy round-tripping.

CREATE TABLE compact_ajar (
  id           TEXT PRIMARY KEY,
  nama         TEXT NOT NULL,
  deskripsi    TEXT,
  kategori     TEXT,
  aktif        INTEGER NOT NULL DEFAULT 1,
  tipe         TEXT,
  teks_arab    TEXT,
  teks_latin   TEXT,
  terjemahan   TEXT,
  sumber       TEXT,
  quran_surah  INTEGER,
  quran_ayat   TEXT,
  hadits_id    TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX idx_compact_kategori ON compact_ajar(kategori);
CREATE INDEX idx_compact_tipe     ON compact_ajar(tipe);
