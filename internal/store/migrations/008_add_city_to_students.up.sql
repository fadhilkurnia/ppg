-- Add a free-form city column. Region codes in the source CSV (CH, RLG,
-- PTM, DC, PD, ATL, BFL, IN, NH, CA, CND) decode to specific cities and
-- give finer-grained location than `kelompok` (which buckets several
-- cities into four regions: California / Chicago / New Hampshire / Canada).
ALTER TABLE students ADD COLUMN city TEXT;
CREATE INDEX idx_students_city ON students(city);
