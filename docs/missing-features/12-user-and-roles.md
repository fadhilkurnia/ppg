---
topic: user management and role expansion
depends-on: [10-domain-model-evolution.md, 11-scope-hierarchy.md]
enables: [20-kelas-system.md, 22-sesi-system.md, 42-parent-child.md, 50-security-hardening.md]
key-concepts: [rbac, manageable-roles, role-delegation, user-crud-api, role-scope-binding]
---

# 12 — User Management & Role Expansion

## TL;DR

Replace the hard-coded `admin | staff` role enum on `users` with a database-driven `roles` table and a `user_roles` association that may bind a role to a specific scope. Add a generic `/api/users` CRUD endpoint family (list, get, create, update, soft-delete) and a `/api/roles` discovery endpoint. Implement the **manageable-roles** delegation pattern: each role has a JSON list of role IDs it is allowed to grant to others. Add `/api/auth/verify` and `/api/auth/refresh` for the gnrs frontend.

Checklist:

- [ ] Migration `012_add_roles` creates `roles` and `user_roles`.
- [ ] Seed the five canonical roles (`admin`, `pengurus`, `guru`, `ortu`, `murid`).
- [ ] Add `internal/store/roles.go`, `internal/handler/roles.go`.
- [ ] Replace direct `users.role` reads with a join through `user_roles` (or compute a primary role on read).
- [ ] Add `/api/users/*` CRUD with scope-aware filtering.
- [ ] Add `/api/auth/verify` (alias of `me`) and `/api/auth/refresh` for the gnrs worker.
- [ ] Keep the existing `users.role` column for backwards compatibility; it now stores the **primary** role label only.

---

## 1. Why this is needed

ppgus today has two roles: `admin` and `staff`. Sitrac and gnrs both model five roles with very different permissions: **admin** (system superuser), **pengurus** (operations staff per scope), **guru** (teacher), **ortu** (parent), **murid** (student). The gnrs frontend's `GnrsRoleOption` even adds **manageable_roles**: which roles a given role may manage. Without a similar concept, ppgus cannot:

- Grant a desa-level pengurus the authority to manage gurus inside their desa but no other.
- Let a guru manage murid accounts but not other gurus.
- Stop a pengurus from creating an admin.

The fix is to externalise the role catalogue and bind role grants to scopes.

## 2. Roles seed

| ID | Label | `can_login` | Manageable roles |
|---|---|---|---|
| `admin` | Admin | 1 | `["admin","pengurus","guru","ortu","murid"]` |
| `pengurus` | Pengurus | 1 | `["guru","ortu","murid"]` |
| `guru` | Guru | 1 | `["murid"]` |
| `ortu` | Orang Tua | 1 | `["murid"]` (their own children only) |
| `murid` | Murid | 1 | `[]` |
| `staff` | Staff (legacy) | 1 | `["murid"]` |

`staff` stays in the seed so existing JWTs keep working. Newly created users should not get `staff`; use `pengurus` instead.

## 3. Data model

### 3.1 `roles`

```sql
CREATE TABLE roles (
    id                  TEXT PRIMARY KEY,
    label               TEXT NOT NULL,
    can_login           INTEGER NOT NULL DEFAULT 1 CHECK (can_login IN (0,1)),
    manageable_role_ids TEXT NOT NULL DEFAULT '[]',  -- JSON array
    sort_order          INTEGER NOT NULL DEFAULT 0,
    created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
```

### 3.2 `user_roles`

```sql
CREATE TABLE user_roles (
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id    TEXT NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    scope_id   TEXT REFERENCES scopes(id) ON DELETE RESTRICT,  -- NULL = global
    is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0,1)),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    PRIMARY KEY (user_id, role_id, scope_id)
);

CREATE INDEX idx_user_roles_role  ON user_roles(role_id);
CREATE INDEX idx_user_roles_scope ON user_roles(scope_id);

-- Each user has at most one primary role.
CREATE UNIQUE INDEX idx_user_roles_one_primary
    ON user_roles(user_id) WHERE is_primary = 1;
```

### 3.3 Migration

`012_add_roles.up.sql`:

```sql
-- (CREATE TABLE roles ...)
-- (CREATE TABLE user_roles ...)

-- Seed canonical roles
INSERT OR IGNORE INTO roles (id, label, sort_order, manageable_role_ids) VALUES
('admin',    'Admin',    10, '["admin","pengurus","guru","ortu","murid"]'),
('pengurus', 'Pengurus', 20, '["guru","ortu","murid"]'),
('guru',     'Guru',     30, '["murid"]'),
('ortu',     'Orang Tua',40, '["murid"]'),
('murid',    'Murid',    50, '[]'),
('staff',    'Staff (legacy)', 99, '["murid"]');

-- Backfill user_roles from existing users.role
INSERT OR IGNORE INTO user_roles (user_id, role_id, scope_id, is_primary)
SELECT id, role, NULL, 1 FROM users;
```

`012_add_roles.down.sql`:

```sql
DROP TABLE IF EXISTS user_roles;
DROP TABLE IF EXISTS roles;
```

### 3.4 Keep `users.role` for compatibility

Do **not** drop the existing `users.role` column. It now serves as the **denormalised primary role** for fast reads. Maintain it in a trigger that mirrors the primary entry in `user_roles`:

```sql
CREATE TRIGGER trg_user_roles_set_primary
AFTER INSERT ON user_roles
FOR EACH ROW WHEN NEW.is_primary = 1
BEGIN
    UPDATE users SET role = NEW.role_id, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = NEW.user_id;
END;
```

(Similar `AFTER UPDATE` if `is_primary` flips.) Application code may rely on `users.role` for permission checks; `user_roles` is consulted for scope-aware decisions.

## 4. Go model & store

`internal/model/role.go`:

```go
package model

type Role struct {
    ID                string    `json:"id"`
    Label             string    `json:"label"`
    CanLogin          bool      `json:"canLogin"`
    ManageableRoleIDs []string  `json:"manageableRoleIds"`
    SortOrder         int       `json:"sortOrder"`
    CreatedAt         time.Time `json:"createdAt"`
    UpdatedAt         time.Time `json:"updatedAt"`
}

type UserRoleBinding struct {
    UserID    string    `json:"userId"`
    RoleID    string    `json:"roleId"`
    ScopeID   *string   `json:"scopeId,omitempty"`
    IsPrimary bool      `json:"isPrimary"`
    CreatedAt time.Time `json:"createdAt"`
}
```

`internal/store/roles.go` minimal surface:

```go
type Roles struct{ db *sql.DB }

func (r *Roles) List(ctx context.Context) ([]model.Role, error)
func (r *Roles) Get(ctx context.Context, id string) (model.Role, error)
func (r *Roles) Update(ctx context.Context, id string, in UpdateRoleInput) error
func (r *Roles) ListBindings(ctx context.Context, userID string) ([]model.UserRoleBinding, error)
func (r *Roles) AddBinding(ctx context.Context, b model.UserRoleBinding) error
func (r *Roles) RemoveBinding(ctx context.Context, userID, roleID string, scopeID *string) error
func (r *Roles) SetPrimary(ctx context.Context, userID, roleID string, scopeID *string) error
```

`internal/store/users.go` gains:

```go
func (u *Users) List(ctx context.Context, filter ListUsersFilter) ([]model.User, int, error)
func (u *Users) Create(ctx context.Context, in CreateUserInput) (model.User, error)
func (u *Users) Update(ctx context.Context, id string, in UpdateUserInput) error
func (u *Users) SetPassword(ctx context.Context, id string, newHash string) error
func (u *Users) Archive(ctx context.Context, id string) error  // soft-delete via status
```

## 5. API contract

### 5.1 Roles

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/roles` | any authed | List all roles |
| GET | `/api/roles/{id}` | any authed | Single role |
| PATCH | `/api/roles/{id}` | admin | Update `label`, `manageable_role_ids`, `can_login` |

### 5.2 Users

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/users` | scoped | List users; filter by `role`, `scopeId`, `q`, `limit`, `offset` |
| GET | `/api/users/{id}` | scoped | Single user; 404 if outside requester's scope |
| POST | `/api/users` | role-gated | Body must match requester's `manageable_role_ids` |
| PATCH | `/api/users/{id}` | role-gated | |
| POST | `/api/users/{id}/password` | self or admin | `{ currentPassword?, newPassword }` |
| DELETE | `/api/users/{id}` | role-gated | Soft-delete; sets `status='archived'` |
| POST | `/api/users/{id}/roles` | role-gated | `{ roleId, scopeId? }` adds binding |
| DELETE | `/api/users/{id}/roles/{roleId}` | role-gated | `?scopeId=...` removes binding |
| POST | `/api/users/bulk` | role-gated | CSV bulk create — see [24](./24-bulk-operations.md) |

### 5.3 Auth additions

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/auth/verify` | yes | Returns `{ user }` ; alias of `/me` for gnrs |
| POST | `/api/auth/refresh` | refresh cookie | Returns new access cookie |
| POST | `/api/auth/logout` | yes | Already exists; ensure it clears both cookies |

The gnrs worker calls `verify` on app boot and `refresh` on 401.

## 6. Manageable-roles enforcement

Two layers:

### 6.1 Server-side validation

When creating a user or granting a role, the handler asserts:

```go
func (h *Users) ensureCanManage(ctx context.Context, actor *auth.ScopedClaims, targetRoleID string) error {
    role, err := h.roles.Get(ctx, actor.PrimaryRoleID)
    if err != nil {
        return err
    }
    for _, r := range role.ManageableRoleIDs {
        if r == targetRoleID {
            return nil
        }
    }
    return errs.NewForbidden("role_not_manageable", "you cannot manage this role")
}
```

### 6.2 Scope-aware filter

In addition to role allowance, the requester's effective scope set must overlap with the target's primary scope. Implementation in [11](./11-scope-hierarchy.md) §9.

```go
if !actor.IsAdmin && !auth.ScopeContains(actor.EffectiveScopeIDs, target.PrimaryScopeID) {
    return errs.NewForbidden("out_of_scope", "user is outside your scope")
}
```

Admins skip both checks.

## 7. JWT claims update

Existing claims:

```json
{ "sub": "<userID>", "role": "admin", "exp": ..., "iat": ... }
```

New claims (additive — old clients still parse):

```json
{
  "sub": "<userID>",
  "role": "admin",
  "roles": ["admin","guru"],
  "primaryScopeId": "01HZQK2KEL0CALIFORNIA",
  "scopeIds": ["01HZQK2KEL0CALIFORNIA","01HZQK2KEL0CANADA"],
  "exp": ..., "iat": ...
}
```

Cap the array sizes server-side (≤ 10 each) so JWTs stay under 4 kB. Users with more roles or scopes should fetch the full list via `/api/auth/verify`.

### 7.1 Refresh token

Add a second cookie `auth_refresh` containing a long-lived (e.g. 30-day) JWT with claims:

```json
{ "sub": "<userID>", "typ": "refresh", "exp": ..., "iat": ... }
```

`POST /api/auth/refresh` reads the refresh cookie, verifies it, fetches user, issues a new short-lived access token, sets `auth` cookie, returns `{ user }`.

Rotation: every refresh issues a new refresh token too. Keep a `refresh_token_jti` column on `users` to allow revocation.

```sql
ALTER TABLE users ADD COLUMN refresh_jti TEXT;
```

On refresh, compare `claims.jti` to `users.refresh_jti`; mismatch → 401 and force re-login.

## 8. Endpoint behaviour by role (reference)

| Endpoint | admin | pengurus | guru | ortu | murid |
|---|---|---|---|---|---|
| `GET /api/users` | all | own scope tree | own scope tree, role=murid only | own children only | self only |
| `POST /api/users` | any role | guru/ortu/murid in own scope | murid in own kelas | murid (own child) | — |
| `GET /api/students` | all | own scope tree | own kelas only | own children only | self only |
| `POST /api/students` | yes | own scope tree | own kelas | — | — |
| `GET /api/kelas` | all | own scope tree | assigned + member | child's kelas | enrolled kelas |
| `POST /api/kelas` | yes | own scope tree | — | — | — |
| `POST /api/sesi/{id}/attendances` | yes | yes | yes | — | self via QR |

This matrix doubles as the handler test plan.

## 9. Test plan

`internal/store/roles_test.go`:

- Seed loads all canonical roles.
- `Update` rewrites `manageable_role_ids` and bumps `updated_at`.
- Adding a binding with `is_primary=1` updates `users.role` via trigger.

`internal/store/users_test.go` (additions):

- List with filter `role=guru` returns only guru users.
- Archive sets status; subsequent List excludes by default.
- Create with duplicate email returns `unique_violation` error.

`internal/handler/users_test.go`:

- Pengurus creating admin → 403 `role_not_manageable`.
- Guru fetching ortu → 403 `out_of_scope`.
- Admin can do anything.
- Refresh with rotated `jti` succeeds and rotates again.
- Logout clears `auth` and `auth_refresh` cookies.

## 10. Frontend impact

`web/app/src/api/auth.ts` gains:

```ts
export async function verify(): Promise<{ user: User }> { ... }
export async function refresh(): Promise<{ user: User }> { ... }
```

`web/app/src/lib/auth.tsx` uses `verify` on mount and `refresh` on 401.

New SPA route: `/admin/users` (list, create, edit). Reuse existing modal/form patterns. The role picker reads `/api/roles` and filters by `manageable_role_ids` of the current user's primary role.

## 11. Migration / backfill steps

1. Run `012_add_roles.up.sql` — seeds canonical roles, backfills `user_roles` from `users.role`.
2. Deploy new code that reads both `users.role` and `user_roles` (compat mode).
3. After verifying no consumer relies on the old enum semantics, run `013_users_role_drop_check.up.sql` to drop the legacy `CHECK (role IN ('admin','staff'))` on `users.role` so non-legacy roles are accepted.

`013_users_role_drop_check.up.sql`:

```sql
-- SQLite cannot drop a CHECK directly; rebuild the table.
CREATE TABLE users_new (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    username TEXT,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    refresh_jti TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
INSERT INTO users_new SELECT id, email, username, password, name, role, NULL, 'active', created_at, updated_at FROM users;
DROP TABLE users;
ALTER TABLE users_new RENAME TO users;
CREATE UNIQUE INDEX idx_users_email    ON users(email);
CREATE UNIQUE INDEX idx_users_username ON users(username) WHERE username IS NOT NULL;
```

Test that on a copy of production data first.

## 12. Open questions

- Should `ortu` and `murid` have logins at all in the first release? The schema permits it; the product may choose to disable `can_login` for one or both initially.
- Do we want **scoped admin** (an admin within a daerah but not globally)? The model supports it via `user_roles.scope_id`. Default initial seed gives `admin` as global; promote scoped admin only when needed.
- Login-by-username: today `users.username` is optional. For murid / ortu (who may not have email), make it required for those role IDs in the user-creation handler.
