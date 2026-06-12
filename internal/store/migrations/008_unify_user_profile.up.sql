-- Unify guru/murid profile fields into the users table so a single User
-- entity represents any person in the system (admin/staff/pengurus/guru/
-- ortu/murid) with the same profile shape.
--
-- The schema migration adds all profile columns. The legacy students and
-- teachers tables are renamed (not dropped) so the boot-time data migration
-- in main.go can copy their rows into users with proper bcrypt password
-- hashing. Once the copy is done, the legacy tables are dropped.

-- Profile (shared across roles, all nullable)
ALTER TABLE users ADD COLUMN nickname      TEXT;
ALTER TABLE users ADD COLUMN date_of_birth DATE;
ALTER TABLE users ADD COLUMN gender        TEXT CHECK (gender IS NULL OR gender IN ('male','female'));
ALTER TABLE users ADD COLUMN no_hp         TEXT;
ALTER TABLE users ADD COLUMN alamat        TEXT;
ALTER TABLE users ADD COLUMN kelompok      TEXT;

-- Murid-only
ALTER TABLE users ADD COLUMN level         TEXT CHECK (level IS NULL OR level IN ('Caberawit','Pra Remaja','Remaja','Pra Nikah'));
ALTER TABLE users ADD COLUMN parent_name   TEXT;
ALTER TABLE users ADD COLUMN parent_phone  TEXT;
ALTER TABLE users ADD COLUMN parent_email  TEXT;

-- Guru-only
ALTER TABLE users ADD COLUMN desa          TEXT;
ALTER TABLE users ADD COLUMN daerah        TEXT;
ALTER TABLE users ADD COLUMN notes         TEXT;

-- Membership lifecycle (active = still ongoing, left = murid keluar, retired = guru purna)
ALTER TABLE users ADD COLUMN joined_at         DATE;
ALTER TABLE users ADD COLUMN left_at           DATE;
ALTER TABLE users ADD COLUMN leave_reason      TEXT;
ALTER TABLE users ADD COLUMN membership_status TEXT NOT NULL DEFAULT 'active'
  CHECK (membership_status IN ('active','left','retired'));

CREATE INDEX idx_users_kelompok          ON users(kelompok);
CREATE INDEX idx_users_level             ON users(level);
CREATE INDEX idx_users_membership_status ON users(membership_status);

ALTER TABLE students RENAME TO students_legacy_008;
ALTER TABLE teachers RENAME TO teachers_legacy_008;
