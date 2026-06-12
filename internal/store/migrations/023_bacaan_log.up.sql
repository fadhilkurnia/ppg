-- 023 — Kontrol Bacaan: per-user log of ayat Qur'an read.
--
-- Each row records a contiguous ayat range. The aggregate progress for a
-- user is COUNT(distinct surah:ayat) across their rows; we compute it
-- on-the-fly in the handler (no materialized counter). Source captures
-- whether the bacaan was recorded during a pengajian (mentored) session or
-- mandiri (self-study).

CREATE TABLE bacaan_log (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL,
  recorded_by  TEXT,
  source       TEXT NOT NULL DEFAULT 'mandiri'
               CHECK (source IN ('pengajian','mandiri')),
  tanggal      TEXT NOT NULL,
  surah        INTEGER NOT NULL,
  ayat_from    INTEGER NOT NULL,
  ayat_to      INTEGER NOT NULL,
  catatan      TEXT,
  sesi_id      TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX idx_bacaan_user      ON bacaan_log(user_id, tanggal);
CREATE INDEX idx_bacaan_recorded  ON bacaan_log(recorded_by);
CREATE INDEX idx_bacaan_sesi      ON bacaan_log(sesi_id);
