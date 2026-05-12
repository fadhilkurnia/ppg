-- Role catalogue + per-user role bindings.
-- See docs/missing-features/12-user-and-roles.md.
--
-- Order matters: we rebuild `users` (to drop the legacy CHECK constraint
-- and add refresh_jti/status) BEFORE creating user_roles. SQLite with
-- foreign_keys=ON rewrites REFERENCES clauses when a referenced table is
-- renamed, so creating user_roles up-front would leave it pointing at the
-- short-lived rename target. Same trap migration 010 documents.

CREATE TABLE roles (
  id                  TEXT PRIMARY KEY,
  label               TEXT NOT NULL,
  can_login           INTEGER NOT NULL DEFAULT 1 CHECK (can_login IN (0,1)),
  manageable_role_ids TEXT NOT NULL DEFAULT '[]',
  sort_order          INTEGER NOT NULL DEFAULT 0,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO roles (id, label, sort_order, manageable_role_ids) VALUES
  ('admin',       'Admin',          10, '["admin","coordinator","teacher","parent","student"]'),
  ('coordinator', 'Coordinator',    20, '["teacher","parent","student"]'),
  ('teacher',     'Teacher',        30, '["student"]'),
  ('parent',      'Parent',         40, '["student"]'),
  ('student',     'Student',        50, '[]'),
  ('staff',       'Staff (legacy)', 99, '["student"]');

-- Rebuild users to drop the legacy CHECK and add refresh_jti + status.
DROP INDEX IF EXISTS idx_users_username;

ALTER TABLE users RENAME TO users_old_011;

CREATE TABLE users (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  username    TEXT,
  password    TEXT NOT NULL,
  name        TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'staff',
  refresh_jti TEXT,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO users (id, email, username, password, name, role, refresh_jti, status, created_at, updated_at)
SELECT id, email, username, password, name, role, NULL, 'active', created_at, updated_at
  FROM users_old_011;

DROP TABLE users_old_011;

CREATE UNIQUE INDEX idx_users_username ON users(username) WHERE username IS NOT NULL;
CREATE INDEX idx_users_role   ON users(role);
CREATE INDEX idx_users_status ON users(status);

-- Now create user_roles against the fresh users table.
CREATE TABLE user_roles (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id    TEXT NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0,1)),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, role_id)
);

CREATE INDEX idx_user_roles_role ON user_roles(role_id);
CREATE UNIQUE INDEX idx_user_roles_one_primary
  ON user_roles(user_id) WHERE is_primary = 1;

-- Backfill: every existing user gets a primary binding mirroring users.role.
INSERT INTO user_roles (user_id, role_id, is_primary)
SELECT id, role, 1 FROM users;
