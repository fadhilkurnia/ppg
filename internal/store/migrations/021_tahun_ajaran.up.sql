-- Tahun Ajaran (academic year). Ported from sitrac-v3's TahunAjaran model.
-- Only one row may be active at a time; the handler/store enforces that
-- invariant (we don't use a partial index because SQLite would still
-- allow two rows with active=0 — the invariant is "exactly one with
-- active=1", which is application-level).
--
-- semester1_start_month / semester2_start_month define which calendar month
-- a semester begins (1-12). PPG default: Sem 1 starts July, Sem 2 starts
-- January.

CREATE TABLE tahun_ajaran (
  id                     TEXT PRIMARY KEY,
  nama                   TEXT NOT NULL UNIQUE,
  active                 INTEGER NOT NULL DEFAULT 0,
  semester1_start_month  INTEGER NOT NULL DEFAULT 7
                         CHECK (semester1_start_month BETWEEN 1 AND 12),
  semester2_start_month  INTEGER NOT NULL DEFAULT 1
                         CHECK (semester2_start_month BETWEEN 1 AND 12),
  tanggal_mulai          TEXT,
  tanggal_selesai        TEXT,
  created_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX idx_tahun_ajaran_active ON tahun_ajaran(active);
