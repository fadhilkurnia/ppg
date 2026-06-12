-- 034 — Extend parent contact for WhatsApp summary feature.
-- parent_title is the free-form sebutan (Bapak / Ibu / Ayahnya / Bunda...).
-- parent_phone_region is one of ID, SG, US, CA — combined with parent_phone
-- the frontend builds an E.164 number for wa.me deep links.
ALTER TABLE users ADD COLUMN parent_title        TEXT;
ALTER TABLE users ADD COLUMN parent_phone_region TEXT CHECK (parent_phone_region IS NULL OR parent_phone_region IN ('ID','SG','US','CA'));
