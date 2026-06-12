-- Extend users with taaruf-app-style biodata fields. None of these are
-- required so existing rows backfill to NULL/false/0.
--
--   user_code       — admin-curated display id (e.g. 'CKR-001'); unique
--                     across the table when non-null.
--   tempat_lahir    — birth city / place
--   pendidikan      — last education (SMA / D3 / S1 / S2 / etc.)
--   pekerjaan       — current job / occupation
--   urutan          — manual sort order inside lists (lower = first)
--   hide_dob        — when true, callers other than admin/PNKB receive
--                     `dateOfBirth = null` to protect privacy
--   tgl_daftar      — registration date, separate from joined_at which
--                     records membership-start in PPG curriculum

ALTER TABLE users ADD COLUMN user_code TEXT;
CREATE UNIQUE INDEX idx_users_user_code ON users(user_code) WHERE user_code IS NOT NULL;

ALTER TABLE users ADD COLUMN tempat_lahir TEXT;
ALTER TABLE users ADD COLUMN pendidikan   TEXT;
ALTER TABLE users ADD COLUMN pekerjaan    TEXT;
ALTER TABLE users ADD COLUMN urutan       INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN hide_dob     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN tgl_daftar   TEXT;
