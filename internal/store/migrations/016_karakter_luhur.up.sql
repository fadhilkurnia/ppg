-- Karakter Luhur — editable replacement for the static `KARAKTER_LUHUR` data
-- shipped in the SPA bundle. Each row is one karakter item belonging to a
-- parent group (e.g., "4 Tali Keimanan"). On first boot the seed function
-- populates the canonical 29 entries; admins can then add/edit/delete.
--
-- (parent, urutan) is the group display order; (parent, item_urutan) is the
-- per-group item order. Both are integers so reordering is cheap.

CREATE TABLE karakter_luhur (
  id            TEXT PRIMARY KEY,
  parent        TEXT NOT NULL,
  parent_en     TEXT,
  parent_urutan INTEGER NOT NULL DEFAULT 0,
  label_id      TEXT NOT NULL,
  label_en      TEXT,
  item_urutan   INTEGER NOT NULL DEFAULT 0,
  catatan       TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX idx_karakter_parent ON karakter_luhur(parent_urutan, item_urutan);
