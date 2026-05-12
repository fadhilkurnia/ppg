-- Rebuild users back to the legacy CHECK and drop role/binding tables.
DROP INDEX IF EXISTS idx_users_status;
DROP INDEX IF EXISTS idx_users_role;
DROP INDEX IF EXISTS idx_users_username;

ALTER TABLE users RENAME TO users_old_011_down;

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
SELECT id, email, username, password, name,
       CASE WHEN role IN ('admin','staff') THEN role ELSE 'staff' END,
       created_at, updated_at
  FROM users_old_011_down;

DROP TABLE users_old_011_down;

CREATE UNIQUE INDEX idx_users_username ON users(username) WHERE username IS NOT NULL;

DROP INDEX IF EXISTS idx_user_roles_one_primary;
DROP INDEX IF EXISTS idx_user_roles_role;
DROP TABLE IF EXISTS user_roles;
DROP TABLE IF EXISTS roles;
