-- Re-add the membership lifecycle columns. New rows inserted between the
-- drop and the re-add will have NULL/default values — there is no way to
-- reconstruct the lost data.

ALTER TABLE users ADD COLUMN joined_at         DATE;
ALTER TABLE users ADD COLUMN left_at           DATE;
ALTER TABLE users ADD COLUMN leave_reason      TEXT;
ALTER TABLE users ADD COLUMN membership_status TEXT NOT NULL DEFAULT 'active'
  CHECK (membership_status IN ('active','left','retired'));

CREATE INDEX idx_users_membership_status ON users(membership_status);
