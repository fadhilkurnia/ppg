DROP INDEX IF EXISTS idx_users_user_code;
ALTER TABLE users DROP COLUMN tgl_daftar;
ALTER TABLE users DROP COLUMN hide_dob;
ALTER TABLE users DROP COLUMN urutan;
ALTER TABLE users DROP COLUMN pekerjaan;
ALTER TABLE users DROP COLUMN pendidikan;
ALTER TABLE users DROP COLUMN tempat_lahir;
ALTER TABLE users DROP COLUMN user_code;
