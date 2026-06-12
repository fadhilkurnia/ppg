DROP INDEX IF EXISTS idx_users_active;
DROP INDEX IF EXISTS idx_users_role;
DROP INDEX IF EXISTS idx_users_username;

ALTER TABLE users RENAME TO users_old_007;

CREATE TABLE users (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  username    TEXT,
  password    TEXT NOT NULL,
  name        TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin','staff')),
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO users (id, email, username, password, name, role, created_at, updated_at)
  SELECT id, email, username, password, name, role, created_at, updated_at
    FROM users_old_007
   WHERE role IN ('admin','staff');

DROP TABLE users_old_007;

CREATE UNIQUE INDEX idx_users_username ON users(username) WHERE username IS NOT NULL;
