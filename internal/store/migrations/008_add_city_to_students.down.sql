DROP INDEX IF EXISTS idx_students_city;

-- SQLite supports DROP COLUMN since 3.35; alpine 3.20 ships a recent enough
-- version. Falls back to a table rebuild if needed.
ALTER TABLE students DROP COLUMN city;
