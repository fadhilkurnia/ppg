-- 041 — Drop the membership lifecycle from users.
--
-- The unified-user mechanism (feat/unified-user-mechanism) collapses
-- guru/murid lifecycle states into the existing `active` boolean. Status is
-- now binary: `active=1` means the person is current; `active=0` means they
-- have left/retired. Reason text and dates are no longer first-class fields.
--
-- /api/students and /api/teachers projection responses synthesise their
-- `status` field from `active` for back-compat — see Student / Teacher
-- projection structs in model/model.go.

DROP INDEX IF EXISTS idx_users_membership_status;

ALTER TABLE users DROP COLUMN joined_at;
ALTER TABLE users DROP COLUMN left_at;
ALTER TABLE users DROP COLUMN leave_reason;
ALTER TABLE users DROP COLUMN membership_status;
