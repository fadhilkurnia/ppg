-- Add gender as a required column on students. Populates existing rows with
-- best-guess values based on names; the operator should review and correct
-- via the UI. Any unmatched name falls back to 'female' so the rebuild with
-- NOT NULL never fails.

ALTER TABLE students ADD COLUMN gender TEXT;

UPDATE students SET gender = 'male' WHERE name IN (
  'Ahmad Hafiz Alexis',
  'Chester Damsyik',
  'Dawud Sofyan Abidin',
  'Dehan Satria Wiraputra',
  'Dwiki Yusuf Abidin',
  'Dylan',
  'Emil Khayri Arrauf',
  'Emir Rambo Althario',
  'Gabriel Khidhir Kusumo-Aji',
  'Irsan Haqi',
  'Jourdan',
  'Kaisar Fatih Kaysan',
  'Khatami Syahrul',
  'Mikail Yusuf Kusumo-Aji',
  'Syahrial abisha'
);

UPDATE students SET gender = 'female' WHERE name IN (
  'Afiqa Kamilatunnisa Hafidza',
  'Bellycia Chloe Anaya',
  'Callista Kayla Permana',
  'Denissa Khusna Abidin',
  'Dinda Asyah Abidin',
  'Fitri Aisyah',
  'Grazia Annafia Gyanne',
  'Jubilee Hung',
  'Khadijah Ameera',
  'Khairuna Meivy Kamila',
  'Kirana Aisyah Kusumo-Aji',
  'Kizmira Fayra Kanaya',
  'Liv',
  'Michelle Cheryl Anaya',
  'Nadeen Haqi',
  'Qalesya Hamraa Fajarudin',
  'Zahra Evanto'
);

-- Catch-all for anything we missed (avoids NOT NULL failure on rebuild).
UPDATE students SET gender = 'female' WHERE gender IS NULL;

DROP INDEX IF EXISTS idx_students_status;
DROP INDEX IF EXISTS idx_students_kelompok;
DROP INDEX IF EXISTS idx_students_level;
DROP INDEX IF EXISTS idx_students_name;

ALTER TABLE students RENAME TO students_old_006;

CREATE TABLE students (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  nickname      TEXT,
  date_of_birth DATE,
  gender        TEXT NOT NULL CHECK (gender IN ('male','female')),
  level         TEXT CHECK (level IS NULL OR level IN ('Caberawit','Pra Remaja','Remaja','Pra Nikah')),
  kelompok      TEXT CHECK (kelompok IS NULL OR kelompok IN ('California','Chicago','New Hampshire','Canada')),
  joined_at     DATE,
  left_at       DATE,
  leave_reason  TEXT,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','left')),
  parent_name   TEXT,
  parent_phone  TEXT,
  parent_email  TEXT,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO students
       (id, name, nickname, date_of_birth, gender, level, kelompok,
        joined_at, left_at, leave_reason, status,
        parent_name, parent_phone, parent_email, created_at, updated_at)
SELECT id, name, nickname, date_of_birth, gender, level, kelompok,
       joined_at, left_at, leave_reason, status,
       parent_name, parent_phone, parent_email, created_at, updated_at
  FROM students_old_006;

DROP TABLE students_old_006;

CREATE INDEX idx_students_name     ON students(name);
CREATE INDEX idx_students_level    ON students(level);
CREATE INDEX idx_students_kelompok ON students(kelompok);
CREATE INDEX idx_students_status   ON students(status);
CREATE INDEX idx_students_gender   ON students(gender);
