-- 042 — Master Wilayah: three-level Daerah -> Desa -> Kelompok that drives the
-- cascading dropdowns in the user editor and the self profile editor. Names
-- only (no abbreviation/code). User rows keep storing the chosen names as free
-- text in users.daerah / users.desa / users.kelompok; these tables are only the
-- option source for the dropdowns. Deleting a parent cascades to its children.

CREATE TABLE wilayah_daerah (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE wilayah_desa (
  id         TEXT PRIMARY KEY,
  daerah_id  TEXT NOT NULL REFERENCES wilayah_daerah(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE wilayah_kelompok (
  id         TEXT PRIMARY KEY,
  desa_id    TEXT NOT NULL REFERENCES wilayah_desa(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX idx_wilayah_desa_daerah   ON wilayah_desa(daerah_id);
CREATE INDEX idx_wilayah_kelompok_desa ON wilayah_kelompok(desa_id);

-- Names unique within their scope so the dropdowns never show duplicates.
CREATE UNIQUE INDEX idx_wilayah_daerah_name   ON wilayah_daerah(name);
CREATE UNIQUE INDEX idx_wilayah_desa_name     ON wilayah_desa(daerah_id, name);
CREATE UNIQUE INDEX idx_wilayah_kelompok_name ON wilayah_kelompok(desa_id, name);
