-- 033 — Sesi live stage state.
-- Stores which materi is currently being projected and the display mode
-- while a sesi is live. Cleared (or just ignored) when ended_at is set.
ALTER TABLE sesi ADD COLUMN live_materi_id   TEXT NULL;
ALTER TABLE sesi ADD COLUMN live_display_mode TEXT NULL;
