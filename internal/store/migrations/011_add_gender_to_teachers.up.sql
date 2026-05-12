-- Add gender as an optional column on teachers. Mirrors migration 006
-- which added gender to students. Optional on teachers because we don't
-- have an immediate need to enforce NOT NULL and avoid a destructive
-- table-rebuild on the live data.

ALTER TABLE teachers
  ADD COLUMN gender TEXT
  CHECK (gender IS NULL OR gender IN ('male','female'));

CREATE INDEX idx_teachers_gender ON teachers(gender);
