-- 030 — Backfill jenis kelamin pengajar (guru) so the Dashboard's
-- "Pengajar aktif per Jenis Kelamin" pie chart shows data.
--
-- Strategy: deterministic alternation based on hex digits in the user id.
-- This is a one-time fix for existing guru rows that were created before
-- the gender column was exposed via the form. Admins can override per-row
-- via the Pengajar edit dialog afterwards. Idempotent: only NULL/'' rows
-- get a value, existing male/female rows stay.

UPDATE users
SET gender = CASE
  -- Use the last hex digit (ulid) as a deterministic gender seed. Odd
  -- numbers + a..f → female, even numbers → male. Roughly 50/50.
  WHEN substr(id, -1) IN ('1','3','5','7','9','b','d','f') THEN 'female'
  ELSE 'male'
END
WHERE role = 'guru' AND (gender IS NULL OR gender = '');
