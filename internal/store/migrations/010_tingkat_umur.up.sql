-- Add age (umur) to tingkat. Existing rows get NULL until the normalize
-- routine in seed_kurikulum.go populates them.
--
-- The normalize routine (NormalizeKurikulumAges) runs after SeedKurikulum
-- and maps grade-based tingkat (PAUD/SD-*/SMP-*/SMA-*) plus the English
-- "X Years Old" names into a single Indonesian age-based set, updating
-- materi_ajar.tingkat references in lockstep and removing the redundant
-- grade-based rows.

ALTER TABLE tingkat ADD COLUMN umur INTEGER;

CREATE INDEX idx_tingkat_umur ON tingkat(umur);
