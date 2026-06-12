-- 043 — Remember which library aspect (reciting/memorizing/review/manqul) a
-- materi was taught as in the Live Stage. Resolved from what was planned (the
-- sesi's attached library item or the kelas's monthly rencana_bulanan) when the
-- guru picks it, so the live display and the end-sesi summary can show
-- "Al-Qur'an · Hafalan" instead of just the kind. Nullable: kurikulum materi
-- and ad-hoc picks that aren't in any plan carry no aspect. Validation of the
-- allowed values happens at the handler layer (oneof), matching how the
-- legacy sesi.library_aspect column was added.
ALTER TABLE sesi_materi_diajarkan ADD COLUMN library_aspect TEXT;
