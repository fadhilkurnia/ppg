-- Track the WhatsApp number used to submit a public /absen entry. Nullable
-- because the dashboard's own admin form does not collect it.
ALTER TABLE attendances ADD COLUMN submitted_phone TEXT;
