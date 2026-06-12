-- 022 — Extend sesi with multi-source library reference.
-- A sesi may pull its content from one of several libraries:
--   kurikulum  → materi_ajar_id is the row (library_kind/aspect/ref unused)
--   quran      → library_ref = "surah:ayahFrom-ayahTo" (or "surah" if global)
--   hadits     → library_ref = hadits_id (or hadits_kitab_id)
--   tilawati   → library_ref = "jilid:page" or tilawati_page_id
--   doa        → library_ref = doa_id
--
-- aspect captures the action — reciting/memorizing/review/manqul. Nullable
-- because kurikulum entries don't need it.

ALTER TABLE sesi ADD COLUMN library_kind TEXT NULL;
ALTER TABLE sesi ADD COLUMN library_aspect TEXT NULL;
ALTER TABLE sesi ADD COLUMN library_ref TEXT NULL;
