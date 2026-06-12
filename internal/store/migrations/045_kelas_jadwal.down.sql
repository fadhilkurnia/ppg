DROP INDEX IF EXISTS idx_sesi_kelas_tanggal;
DROP INDEX IF EXISTS idx_sesi_jadwal;
ALTER TABLE sesi DROP COLUMN jadwal_id;
DROP INDEX IF EXISTS idx_kelas_jadwal_kelas;
DROP TABLE IF EXISTS kelas_jadwal;
