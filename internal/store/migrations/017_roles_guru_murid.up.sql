-- Add guru and murid roles for the school portal.
INSERT OR IGNORE INTO roles (id, label, sort_order, manageable_role_ids) VALUES
  ('guru',  'Guru',  30, '["murid","student"]'),
  ('murid', 'Murid', 50, '[]');

UPDATE roles
SET manageable_role_ids = '["admin","guru","murid","coordinator","teacher","parent","student"]'
WHERE id = 'admin';

UPDATE roles
SET manageable_role_ids = '["murid","student"]'
WHERE id IN ('teacher', 'guru');
