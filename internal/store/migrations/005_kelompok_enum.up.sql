-- Pin the four valid kelompoks (California, Chicago, New Hampshire, Canada).
-- Step 1 maps every existing variant to its canonical form. Step 2 rebuilds
-- the students table with a CHECK so future inserts can't drift again.

UPDATE students
   SET kelompok = CASE
     WHEN lower(kelompok) LIKE '%chicago%'                                  THEN 'Chicago'
     WHEN lower(kelompok) LIKE '%canada%'                                   THEN 'Canada'
     WHEN lower(kelompok) LIKE '%california%'
       OR lower(kelompok) LIKE '%los angeles%'                              THEN 'California'
     WHEN lower(kelompok) LIKE '%new hampshire%'
       OR lower(kelompok) LIKE '%raleigh%'
       OR lower(kelompok) LIKE '%nh%'                                       THEN 'New Hampshire'
     ELSE kelompok
   END
 WHERE kelompok IS NOT NULL;

DROP INDEX IF EXISTS idx_students_status;
DROP INDEX IF EXISTS idx_students_kelompok;
DROP INDEX IF EXISTS idx_students_level;
DROP INDEX IF EXISTS idx_students_name;

ALTER TABLE students RENAME TO students_old_005;

CREATE TABLE students (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  nickname      TEXT,
  date_of_birth DATE,
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

INSERT INTO students SELECT * FROM students_old_005;
DROP TABLE students_old_005;

CREATE INDEX idx_students_name     ON students(name);
CREATE INDEX idx_students_level    ON students(level);
CREATE INDEX idx_students_kelompok ON students(kelompok);
CREATE INDEX idx_students_status   ON students(status);
