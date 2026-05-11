---
topic: persistent in-app notifications
depends-on: [10-domain-model-evolution.md, 30-real-time-websockets.md]
enables: [42-parent-child.md]
key-concepts: [notification-table, delivery-channel, badge-count, write-fan-out, optional-push]
---

# 32 — Notifications

## TL;DR

Add a `notifications` table that stores one row per (recipient, kind, payload). Notifications are produced by domain events (assignment graded, sesi started, kelas enrolled, tugas assigned, etc.). They are delivered in three ways:

1. **Persisted in DB** — visible in the notification bell UI even after refresh.
2. **Pushed via WebSocket** ([30](./30-real-time-websockets.md)) to `user:<userID>` rooms.
3. **(Optional) Web push / FCM / email** — pluggable adapters; not in v1.

Checklist:

- [ ] Migration `018_add_notifications` (table already specified in [10](./10-domain-model-evolution.md) §3.16).
- [ ] Add `internal/store/notifications.go`.
- [ ] Add `internal/notify/` orchestrator package.
- [ ] Add `internal/handler/notifications.go` (list, mark read, mark all read).
- [ ] Document notification kinds (§5).
- [ ] Emit `notification:new` event after every insert.

---

## 1. Data model

```sql
CREATE TABLE notifications (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind        TEXT NOT NULL,                  -- e.g. 'sesi.started', 'materi.graded'
    subject     TEXT NOT NULL,                  -- display title
    body        TEXT,                           -- display body
    link        TEXT,                           -- in-app path
    meta        TEXT NOT NULL DEFAULT '{}',     -- JSON for extra data
    read_at     TEXT,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX idx_notifications_user_unread ON notifications(user_id, read_at);
CREATE INDEX idx_notifications_user_created ON notifications(user_id, created_at);
```

Notes:

- `kind` is a dotted namespace string. Each kind is documented in §5.
- `subject` and `body` are pre-rendered server-side using the user's locale (see [51](./51-frontend-evolution.md) §5 for i18n bootstrap).
- `link` is a relative SPA route, e.g. `/_authed/kelas/01HZ.../sesi/01HZ...`.
- `meta` may carry IDs that let the SPA fetch a fresh resource on click; never sensitive data.

## 2. Orchestrator package

```
internal/notify/
├── notify.go        // Notify struct, Send / SendMany, batched writes
├── kinds.go         // Constants for kinds + per-kind template strings
└── notify_test.go
```

```go
package notify

type Notifier struct {
    store *store.Notifications
    pub   realtime.Publisher
}

type Event struct {
    Kind    string
    UserIDs []string
    Subject string
    Body    string
    Link    string
    Meta    map[string]any
}

func (n *Notifier) Send(ctx context.Context, e Event) error {
    // Insert one row per user_id, then publish to user:<uid> rooms.
}
```

Call sites (examples):

```go
notifier.Send(ctx, notify.Event{
    Kind:    "sesi.started",
    UserIDs: enrolledUserIDs,
    Subject: "Sesi dimulai",
    Body:    fmt.Sprintf("Sesi kelas %s sudah dimulai", kelasName),
    Link:    fmt.Sprintf("/_authed/kelas/%s/sesi/%s", kelasID, sesiID),
    Meta:    map[string]any{"sesiId": sesiID, "kelasId": kelasID},
})
```

## 3. API contract

| Method | Path | Notes |
|---|---|---|
| GET | `/api/notifications?limit=50&before=<ULID>&unread=true` | paginated; cursor on `created_at` |
| GET | `/api/notifications/unread-count` | `{ "data": { "count": 7 } }` |
| POST | `/api/notifications/{id}/read` | flips `read_at = now()` (idempotent) |
| POST | `/api/notifications/read-all` | bulk mark all unread as read |
| DELETE | `/api/notifications/{id}` | hard-delete (rarely needed) |

## 4. Real-time

Notification insert publishes `notification:new` to `user:<userID>`:

```json
{ "kind": "notification:new", "room": "user:01HZ...",
  "payload": { "id":"01HZ...", "kind":"sesi.started", "subject":"...", "body":"...", "link":"...", "createdAt":"..." } }
```

The SPA's notification bell decrements / increments a badge count on receipt and prepends the entry to the dropdown.

## 5. Notification kinds (initial catalog)

| Kind | Triggered by | Audience | Link |
|---|---|---|---|
| `sesi.started` | scheduler / explicit start | enrolled murid (+ ortu of) | `/_authed/kelas/{kelasId}/sesi/{sesiId}` |
| `sesi.cancelled` | guru cancel | enrolled murid (+ ortu) | `/_authed/kelas/{kelasId}` |
| `sesi.tugas_assigned` | guru creates tugas | assigned murid | `/_authed/me/tugas/{tugasId}` |
| `sesi.tugas_reviewed` | guru reviews tugas | murid | `/_authed/me/tugas/{tugasId}` |
| `materi.assigned` | new assignment | murid | `/_authed/me/raport` |
| `materi.graded` | guru grades | murid (+ ortu) | `/_authed/me/raport` |
| `kelas.enrolled` | enrolment | murid (+ ortu) | `/_authed/kelas/{kelasId}` |
| `kelas.removed` | unenrolment | murid (+ ortu) | `/_authed/me` |
| `account.password_changed` | password change | user | `/_authed/me/settings` |
| `system.announcement` | admin pushes a broadcast | targeted scope | configurable |

## 6. Delivery channels (future)

A `delivery_channels` table can be added later:

```sql
CREATE TABLE notification_channels (
    user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel  TEXT NOT NULL CHECK (channel IN ('inapp','email','push')),
    enabled  INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (user_id, channel)
);
```

The notifier reads each user's channels and fans out. Adapters:

- **inapp**: write row + WS publish (current).
- **email**: SMTP sender (`SMTP_*` env vars). Throttled per (user_id, kind) to 1/day for non-urgent kinds.
- **push**: web push (VAPID keys) and/or FCM. Requires a service worker on the frontend ([51](./51-frontend-evolution.md) §7).

## 7. Frontend

`web/app/src/components/NotificationBell.tsx`:

- Polls `/api/notifications/unread-count` every 60 s as fallback.
- Subscribes to `user:<myUserID>` over WS; on `notification:new`, bumps count + prepends item.
- Dropdown shows last 20; "View all" goes to `/_authed/notifications`.
- Clicking an item marks-read and navigates.

`/_authed/notifications` page:

- Tabs: All / Unread.
- Bulk "mark all read" button.
- Per-kind filter.

## 8. Test plan

`internal/store/notifications_test.go`:

- Insert + List with `unread=true` returns only unread.
- Mark-read is idempotent.
- Bulk mark-all-read sets `read_at` for all.

`internal/notify/notify_test.go`:

- `Send` writes one row per recipient.
- `Send` is transactional: a failed write does not publish.
- `Send` is fan-out-safe (no panic when `realtime.Publisher` is nil).

`internal/handler/notifications_test.go`:

- Users can only read their own notifications.
- Mark-read returns 404 for foreign IDs.

## 9. Open questions

- **Digest emails**: should a daily/weekly digest exist for low-priority kinds? Yes, behind a flag. Use the scheduler ([22](./22-sesi-system.md) §4) as the dispatcher.
- **Snooze**: do we want per-user kind-suppression? Add `notification_mutes` later if needed.
- **Templates**: store per-kind templates in the DB or in code? Recommendation: in code (`internal/notify/kinds.go`) with i18n strings — add a DB override later.
