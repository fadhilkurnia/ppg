-- 035 — Tracks materi yang benar-benar diajarkan dalam sesi live stage.
-- Setiap kali guru memilih materi di Live Stage, satu row baru dibuat di sini
-- (mengganti materi = append, bukan replace). Saat akhiri sesi, guru
-- mengkonfirmasi tiap row: butuh review ortu? + catatan untuk ortu.
--
-- kind:
--   kurikulum   — ref kosong, materi_ajar_id terisi
--   quran       — ref = "surah" | "surah:ayat" | "surah:from-to"
--   hadits      — ref = "kitab/bab"
--   tilawati    — ref = "jilid/halaman"
--   doa         — ref = compact_ajar.id
CREATE TABLE sesi_materi_diajarkan (
  id                  TEXT PRIMARY KEY,
  sesi_id             TEXT NOT NULL,
  kind                TEXT NOT NULL CHECK (kind IN ('kurikulum','quran','hadits','tilawati','doa')),
  materi_ajar_id      TEXT,
  ref                 TEXT,
  label               TEXT,
  needs_parent_review INTEGER NOT NULL DEFAULT 0,
  parent_note         TEXT,
  taught_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (sesi_id) REFERENCES sesi(id) ON DELETE CASCADE
);
CREATE INDEX idx_smd_sesi      ON sesi_materi_diajarkan(sesi_id, taught_at);
CREATE INDEX idx_smd_materi    ON sesi_materi_diajarkan(materi_ajar_id);
