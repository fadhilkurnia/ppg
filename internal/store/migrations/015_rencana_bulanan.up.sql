-- Rencana Bulanan (Teaching Plan): a monthly bundle of materi_ajar items
-- selected to be taught for a specific kelas. Ported from sitrac-v3's
-- RencanaBulanan/RencanaBulananItem models. Simplified — no tahun_ajaran FK
-- (we use kelas.tahun), no progresif/free-form items (only kurikulum links),
-- no per-item sesi attachment.

CREATE TABLE rencana_bulanan (
  id            TEXT PRIMARY KEY,
  kelas_id      TEXT NOT NULL,
  tahun         INTEGER NOT NULL,
  bulan         INTEGER NOT NULL CHECK (bulan BETWEEN 1 AND 12),
  semester      INTEGER,
  catatan       TEXT,
  created_by    TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(kelas_id, tahun, bulan)
);

CREATE INDEX idx_rencana_bulanan_kelas ON rencana_bulanan(kelas_id);

CREATE TABLE rencana_bulanan_item (
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

CREATE INDEX idx_rencana_item_rencana ON rencana_bulanan_item(rencana_id);
CREATE INDEX idx_rencana_item_materi  ON rencana_bulanan_item(materi_ajar_id);
