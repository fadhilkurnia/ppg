DROP INDEX IF EXISTS idx_sesi_kelas;
ALTER TABLE sesi DROP COLUMN kelas_id;
DROP INDEX IF EXISTS idx_kelas_anggota_murid;
DROP TABLE IF EXISTS kelas_anggota;
DROP INDEX IF EXISTS idx_kelas_guru;
DROP INDEX IF EXISTS idx_kelas_tingkat;
DROP TABLE IF EXISTS kelas;
