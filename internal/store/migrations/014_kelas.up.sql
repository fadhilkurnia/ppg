-- Kelas (classroom): groups generus under a guru for a specific tingkat.
-- Inspired by sitrac-v3's Kelas model but simplified — GNRS doesn't yet have
-- a TahunAjaran entity, so we use a plain `tahun` integer for now.
--
-- guru_user_id references users.id with role='guru' (enforced at handler
-- level, not via SQL constraint to keep migrations simple).

CREATE TABLE kelas (
  id            TEXT PRIMARY KEY,
  nama          TEXT NOT NULL,
  tingkat       TEXT NOT NULL,
  guru_user_id  TEXT,
  tahun         INTEGER NOT NULL DEFAULT (CAST(strftime('%Y','now') AS INTEGER)),
  deskripsi     TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(nama, tahun)
);

CREATE INDEX idx_kelas_tingkat ON kelas(tingkat);
CREATE INDEX idx_kelas_guru    ON kelas(guru_user_id);

-- Anggota kelas (murid-only). Each murid can belong to at most one kelas
-- per tahun, enforced via UNIQUE(murid_user_id, tahun) using the kelas join.
CREATE TABLE kelas_anggota (
  kelas_id        TEXT NOT NULL,
  murid_user_id   TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (kelas_id, murid_user_id)
);

CREATE INDEX idx_kelas_anggota_murid ON kelas_anggota(murid_user_id);

-- Add kelas_id to sesi (nullable so existing rows are unaffected). Sesi can
-- still be created without a kelas (open jadwal), but the new Kelas page
-- groups sesi by kelas when set.
ALTER TABLE sesi ADD COLUMN kelas_id TEXT;
CREATE INDEX idx_sesi_kelas ON sesi(kelas_id);
