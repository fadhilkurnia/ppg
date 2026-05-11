---
topic: audit / activity log
depends-on: [10-domain-model-evolution.md, 12-user-and-roles.md]
enables: []
key-concepts: [activity-log, before-after-snapshot, append-only, retention]
---

# 34 — Audit / Activity Log

## TL;DR

Record every mutating action against the system in an append-only `activity_log` table. Capture actor, action namespace, resource type and id, before / after JSON snapshots, IP, and user agent. Provide read endpoints for admins and a per-resource history view in the UI.

Checklist:

- [ ] Migration `019_add_activity_log` (DDL already in [10](./10-domain-model-evolution.md) §3.17).
- [ ] Add `internal/audit/` package with a `Recorder` interface and an `sqliteRecorder`.
- [ ] Inject `audit.Recorder` into every store that mutates.
- [ ] Wrap mutating handlers with a middleware that captures actor + IP + UA into context.
- [ ] Expose `/api/activity-log` (admin) and `/api/{entity}/{id}/history` (per-resource).
- [ ] Document retention policy and an optional archival job.

---

## 1. Why this is needed

ppgus has no historical record of who changed what. If a grade flips, a sesi is cancelled, or a user's role is altered, there is no after-the-fact way to inspect the change. Sitrac maintains `ActivityLog`. gnrs delegates audit to the backend. We add the same primitive.

## 2. Data model

DDL is in [10-domain-model-evolution.md §3.17](./10-domain-model-evolution.md). Key shape:

```sql
CREATE TABLE activity_log (
    id            TEXT PRIMARY KEY,
    actor_user_id TEXT REFERENCES users(id),    -- NULL → system
    action        TEXT NOT NULL,                 -- e.g. 'kelas.create'
    resource_type TEXT NOT NULL,                 -- e.g. 'kelas'
    resource_id   TEXT,
    before        TEXT,                          -- JSON snapshot (nullable)
    after         TEXT,                          -- JSON snapshot (nullable)
    ip            TEXT,
    user_agent    TEXT,
    request_id    TEXT,
    meta          TEXT NOT NULL DEFAULT '{}',
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX idx_activity_actor    ON activity_log(actor_user_id, created_at);
CREATE INDEX idx_activity_resource ON activity_log(resource_type, resource_id, created_at);
CREATE INDEX idx_activity_action   ON activity_log(action, created_at);
```

The table is **append-only**: no UPDATE, no DELETE except for the archival job.

## 3. Recorder package

```
internal/audit/
├── recorder.go   // Recorder interface
├── sqlite.go     // sqliteRecorder writes one row per call
├── context.go    // helpers to enrich context (actor, ip, ua, request_id)
└── audit_test.go
```

```go
package audit

type Recorder interface {
    Record(ctx context.Context, e Event) error
}

type Event struct {
    Action       string
    ResourceType string
    ResourceID   string
    Before, After any
    Meta         map[string]any
}
```

The `sqliteRecorder` marshals `Before`/`After` as JSON. On error it logs but **does not block** the parent operation:

```go
func (r *sqliteRecorder) Record(ctx context.Context, e Event) error {
    actor, _ := actorFromContext(ctx)
    ip, ua, _ := requestMetaFromContext(ctx)
    b, _ := json.Marshal(e.Before)
    a, _ := json.Marshal(e.After)
    _, err := r.db.ExecContext(ctx, `INSERT INTO activity_log (...) VALUES (...)`, ...)
    if err != nil {
        r.log.Warn("audit write failed", "err", err)
    }
    return err
}
```

## 4. Action namespace

Naming pattern: `<entity>.<verb>`.

| Entity | Verbs |
|---|---|
| `auth` | `login`, `login_failed`, `logout`, `refresh`, `password_change` |
| `user` | `create`, `update`, `archive`, `role_add`, `role_remove` |
| `scope` | `create`, `update`, `archive` |
| `kelas` | `create`, `update`, `archive`, `enroll`, `unenroll` |
| `kelas_template` | `create`, `update`, `archive`, `clone` |
| `materi` | `create`, `update`, `archive`, `assign`, `unassign`, `grade` |
| `sesi` | `create`, `update`, `start`, `end`, `cancel`, `reopen`, `archive` |
| `sesi_attendance` | `record` |
| `media` | `upload`, `archive` |
| `bulk` | `<entity>.bulk_import` |

Use these strings unchanged so dashboards can rely on the namespace.

## 5. Hooking it in

The handler middleware captures actor + IP + UA into context:

```go
func AuditContext(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        ctx := r.Context()
        if c, ok := auth.FromRequest(r); ok {
            ctx = audit.WithActor(ctx, c.UserID)
        }
        ctx = audit.WithRequestMeta(ctx, audit.RequestMeta{
            IP:        clientIP(r),
            UserAgent: r.UserAgent(),
            RequestID: middleware.GetReqID(ctx),
        })
        next.ServeHTTP(w, r.WithContext(ctx))
    })
}
```

The store package then records inside the same transaction as the change:

```go
func (k *Kelas) Create(ctx context.Context, in CreateKelasInput) (model.Kelas, error) {
    tx, _ := k.db.BeginTx(ctx, nil); defer tx.Rollback()
    // ... INSERT ... read back ...
    _ = k.audit.Record(ctx, audit.Event{
        Action:       "kelas.create",
        ResourceType: "kelas",
        ResourceID:   row.ID,
        After:        row,
    })
    tx.Commit()
    return row, nil
}
```

Record errors do not roll back the transaction; the audit table is best-effort. (We can switch to transactional with `Exec` inside the tx if a stricter guarantee is needed later.)

## 6. API contract

### 6.1 Admin global view

```
GET /api/activity-log?action=&resourceType=&actorUserId=&resourceId=&from=&to=&limit=&offset=
```

Returns rows ordered by `created_at DESC`. Admin only.

### 6.2 Per-resource history

```
GET /api/kelas/{id}/history
GET /api/users/{id}/history
GET /api/sesi/{id}/history
```

Returns the `activity_log` rows whose `resource_type/id` match. Read-allowed by anyone who can read the resource itself.

## 7. Retention & archival

Default retention: **365 days** in the live DB. Beyond that, a daily job moves rows to a `data/activity_log_archive_<yyyy_mm>.jsonl.gz` file and deletes them.

```go
type ActivityArchiveJob struct{ store *store.Activity; root string }

func (j *ActivityArchiveJob) Name() string { return "activity.archive" }
```

For compliance scenarios this can be longer or shorter; expose as `AUDIT_RETENTION_DAYS`.

## 8. Privacy considerations

- `before` / `after` snapshots must not include sensitive fields. Strip `password`, `refresh_jti`, `qr_token`, etc. before serialising.
- IP is recorded as-is; for GDPR-style requests, the archival job can replace IPs with `x.x.x.0` after N days (configurable).
- `user_agent` is recorded; truncate to 200 chars to bound row size.

## 9. Test plan

`internal/audit/audit_test.go`:

- Recording an event inserts a row.
- A failed insert is logged but does not error the caller.
- `before`/`after` are JSON-encoded.
- Sensitive fields (set in a denylist) are stripped.

`internal/handler/activity_test.go`:

- Non-admin requesting `/api/activity-log` → 403.
- Admin can paginate.
- Per-resource history filters correctly.

## 10. Open questions

- **Sync vs async write**: insert inline (current proposal) keeps strict ordering but adds latency. A bounded channel + worker would be lower latency at the cost of possible loss. Recommendation: stay sync; revisit only if measurable.
- **Cross-table joins for the UI**: showing "user X enrolled student Y into kelas Z" needs joins. Either expand the audit row with denormalised display fields, or join at read time. Recommendation: join at read time.
- **PII redaction**: a separate `audit_redaction_rules` table could mark fields to redact on read. Defer; see Privacy §8 stripping rules first.
