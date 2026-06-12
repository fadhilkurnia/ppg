-- Manqul note: a per-user annotation on either a single word (wordIdx >= 0)
-- or an entire ayah (wordIdx = -1) within an ayah of the Qur'an. Ported
-- 1:1 from sitrac-v3's QuranManqulNote model.

CREATE TABLE quran_manqul_note (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL,
  kunci_ayat   TEXT NOT NULL,
  word_idx     INTEGER NOT NULL,
  teks         TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(user_id, kunci_ayat, word_idx)
);

CREATE INDEX idx_manqul_user ON quran_manqul_note(user_id, kunci_ayat);
