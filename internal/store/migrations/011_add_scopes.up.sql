-- Three-level organisational tree: daerah -> desa -> kelompok.
-- See docs/missing-features/11-scope-hierarchy.md.

CREATE TABLE scopes (
  id          TEXT PRIMARY KEY,
  parent_id   TEXT REFERENCES scopes(id) ON DELETE RESTRICT,
  kind        TEXT NOT NULL CHECK (kind IN ('daerah','desa','kelompok')),
  name        TEXT NOT NULL,
  code        TEXT,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_scopes_parent    ON scopes(parent_id);
CREATE INDEX idx_scopes_kind_name ON scopes(kind, name);
CREATE INDEX idx_scopes_status    ON scopes(status);

CREATE TABLE user_scopes (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope_id   TEXT NOT NULL REFERENCES scopes(id) ON DELETE RESTRICT,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0,1)),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, scope_id)
);

CREATE INDEX idx_user_scopes_scope ON user_scopes(scope_id);
CREATE UNIQUE INDEX idx_user_scopes_one_primary
  ON user_scopes(user_id) WHERE is_primary = 1;

-- Seed the existing four kelompok values under a synthetic Americas daerah.
-- Deterministic IDs so backfill and tests can reference them.
INSERT INTO scopes (id, parent_id, kind, name, code) VALUES
  ('SCOPE_DAERAH_AMERICAS', NULL, 'daerah', 'Americas', 'AMS');

INSERT INTO scopes (id, parent_id, kind, name, code) VALUES
  ('SCOPE_DESA_WEST',      'SCOPE_DAERAH_AMERICAS', 'desa', 'West US',      'WEST'),
  ('SCOPE_DESA_MIDWEST',   'SCOPE_DAERAH_AMERICAS', 'desa', 'Midwest US',   'MID'),
  ('SCOPE_DESA_NORTHEAST', 'SCOPE_DAERAH_AMERICAS', 'desa', 'Northeast US', 'NE'),
  ('SCOPE_DESA_CANADA',    'SCOPE_DAERAH_AMERICAS', 'desa', 'Canada',       'CA');

INSERT INTO scopes (id, parent_id, kind, name, code) VALUES
  ('SCOPE_KEL_CALIFORNIA', 'SCOPE_DESA_WEST',      'kelompok', 'California',    'CA'),
  ('SCOPE_KEL_CHICAGO',    'SCOPE_DESA_MIDWEST',   'kelompok', 'Chicago',       'CHI'),
  ('SCOPE_KEL_NEWHAMP',    'SCOPE_DESA_NORTHEAST', 'kelompok', 'New Hampshire', 'NH'),
  ('SCOPE_KEL_CANADA',     'SCOPE_DESA_CANADA',    'kelompok', 'Canada',        'CAN');
