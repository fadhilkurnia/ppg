-- 031 — Global settings (key-value) table.
--
-- Used for branding (instansi name + logo data-URL) and any future
-- single-row configuration that doesn't deserve its own table.

CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Default brand suffix mirrors the previous hard-coded "US".
INSERT OR IGNORE INTO settings (key, value) VALUES ('instansi_name', 'US');
