-- Manqul share: lets a user (owner) expose their manqul notes for a single
-- ayah (kunci_ayat) to specific recipient users. Sharing is per-ayah and
-- per-recipient; a viewer only ever sees manqul for an ayah explicitly shared
-- with them. The shared content is whatever the owner annotated on that ayah
-- in quran_manqul_note (the wordIdx = -1 per-ayah note AND every wordIdx >= 0
-- per-word note).

CREATE TABLE quran_manqul_share (
  id                 TEXT PRIMARY KEY,
  owner_user_id      TEXT NOT NULL,
  kunci_ayat         TEXT NOT NULL,
  recipient_user_id  TEXT NOT NULL,
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(owner_user_id, kunci_ayat, recipient_user_id)
);

-- Viewer lookup: "which owners shared something in this surah with me?" and
-- "fetch the notes owner O shared with me for these ayat" both filter on
-- recipient first.
CREATE INDEX idx_manqul_share_recipient ON quran_manqul_share(recipient_user_id, kunci_ayat);

-- Owner lookup: "what have I shared, and to whom?" for the share dialog.
CREATE INDEX idx_manqul_share_owner ON quran_manqul_share(owner_user_id, kunci_ayat);
