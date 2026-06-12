-- Hadits library — ported from sitrac-v3's HaditsKitab/HaditsBab/Hadits
-- models. Seeded on first boot from an embedded SQL file if the table is
-- empty (see internal/store/seed_hadits.go).
--
-- scope: 'hadits' | 'maktabah' | 'both'  → controls which Pustaka landing
-- bucket the kitab appears in (Himpunan vs Maktabah Syamilah).

CREATE TABLE hadits_kitab (
  id              TEXT PRIMARY KEY,
  slug            TEXT NOT NULL UNIQUE,
  nama            TEXT NOT NULL,
  nama_arab       TEXT,
  deskripsi       TEXT,
  perawi          TEXT,
  urutan          INTEGER NOT NULL DEFAULT 0,
  scope           TEXT NOT NULL DEFAULT 'both'
                  CHECK (scope IN ('hadits','maktabah','both')),
  jumlah_halaman  INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX idx_hadits_kitab_scope  ON hadits_kitab(scope);
CREATE INDEX idx_hadits_kitab_urutan ON hadits_kitab(urutan);

CREATE TABLE hadits_bab (
  id          TEXT PRIMARY KEY,
  kitab_id    TEXT NOT NULL,
  nomor       INTEGER NOT NULL,
  nama        TEXT NOT NULL,
  deskripsi   TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX idx_hadits_bab_kitab ON hadits_bab(kitab_id, nomor);

CREATE TABLE hadits (
  id            TEXT PRIMARY KEY,
  kitab_id      TEXT NOT NULL,
  bab_id        TEXT,
  nomor         INTEGER NOT NULL,
  teks_arab     TEXT,
  teks_latin    TEXT,
  terjemahan    TEXT,
  terjemahan_en TEXT,
  perawi        TEXT,
  derajat       TEXT,
  sumber_asli   TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX idx_hadits_kitab ON hadits(kitab_id, nomor);
CREATE INDEX idx_hadits_bab   ON hadits(bab_id, nomor);
