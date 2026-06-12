-- Photo filename stored relative to the photos directory (e.g., "01H...xyz.jpg").
-- The full file lives at $PHOTOS_DIR/<photo_path> on the volume; the API
-- exposes it via /api/files/photos/<photo_path>. NULL = no photo.
ALTER TABLE users ADD COLUMN photo_path TEXT;
