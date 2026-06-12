-- IANA tz database name (e.g., "Asia/Jakarta", "America/New_York"). NULL or
-- empty falls back to the app's display default. Used by the Kehadiran
-- (teaching plan) calendar to render sesi times in the user's local zone.
ALTER TABLE users ADD COLUMN timezone TEXT;
