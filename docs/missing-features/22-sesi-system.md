---
topic: sesi (session) entity with lifecycle state machine
depends-on: [10-domain-model-evolution.md, 20-kelas-system.md, 21-materi-system.md]
enables: [23-qr-attendance.md, 31-chat-messaging.md, 30-real-time-websockets.md]
key-concepts: [session-lifecycle, state-machine, scheduler, attendance, sesi-tugas]
---

# 22 — Sesi (Session) System

## TL;DR

Introduce a `sesi` entity representing a scheduled teaching event with a **state machine** (`upcoming → active → ended`), per-session attendance (`sesi_attendances`), post-session notes (`sesi_notes`), and homework (`sesi_tugas`). Add a tiny in-process scheduler (`internal/scheduler/`) that flips session statuses at the appropriate times. Expose endpoints under `/api/sesi`.

Checklist:

- [ ] Migration `016_add_sesi` creates `sesi`, `sesi_attendances`.
- [ ] Migration `017_add_sesi_chat_notes_tugas` creates `sesi_chat_messages`, `sesi_notes`, `sesi_tugas`.
- [ ] Add `internal/store/sesi.go`, `internal/store/sesi_attendances.go`, `internal/store/sesi_notes.go`, `internal/store/sesi_tugas.go`.
- [ ] Add `internal/handler/sesi.go`.
- [ ] Add `internal/scheduler/scheduler.go` (lifecycle ticker).
- [ ] Wire scheduler in `cmd/server/main.go`.
- [ ] Add tests for state transitions and attendance recording.

---

## 1. Why this is needed

`attendances` today stores `(student_id, teacher_id, date, status, materi, durationMin)`. That model has limitations:

1. No grouping: there is no "session" entity that several attendance rows belong to.
2. No lifecycle: attendance is a fait accompli — nothing represents "this class is starting in 5 minutes".
3. No participation artefacts: chat, notes, homework all live nowhere.
4. No real-time hooks: there's nothing for a future Socket layer to broadcast on.

`sesi` is the structural fix. It owns:

- One scheduled occurrence (date + start/end times).
- A roster derived from `kelas_enrollments`.
- An attendance log specific to that occurrence.
- Per-session chat, notes, and homework artefacts.
- Lifecycle state usable by UI ("Mengajar Hari Ini").

## 2. State machine

```
                ┌──────────┐    start    ┌────────┐    end    ┌───────┐
                │ upcoming │ ──────────► │ active │ ────────► │ ended │
                └──────────┘             └────────┘           └───────┘
                     │                                            ▲
                     │                cancel                      │
                     └──────────────► [cancelled] ──── reopen ────┘
                                          ▲
                                          │ from any state
                                          ▼
                                     [archived]    (admin-only)
```

Transitions:

| From | To | Triggered by |
|---|---|---|
| upcoming | active | Scheduler at `tanggal + jam_mulai` OR explicit `POST /sesi/{id}/start` |
| active | ended | Scheduler at `tanggal + jam_selesai` OR explicit `POST /sesi/{id}/end` |
| upcoming \| active | cancelled | Explicit `POST /sesi/{id}/cancel` (admin / guru) |
| cancelled | upcoming | Explicit `POST /sesi/{id}/reopen` |
| any | archived | Admin only |

State change is logged to `activity_log` ([34](./34-audit-log.md)).

## 3. Data model

### 3.1 `sesi`

```sql
CREATE TABLE sesi (
    id                   TEXT PRIMARY KEY,
    kelas_id             TEXT NOT NULL REFERENCES kelas(id)   ON DELETE RESTRICT,
    materi_id            TEXT REFERENCES materi(id)           ON DELETE SET NULL,
    tanggal              TEXT NOT NULL,                              -- YYYY-MM-DD
    jam_mulai            TEXT NOT NULL,                              -- HH:MM
    jam_selesai          TEXT,                                       -- HH:MM
    status               TEXT NOT NULL DEFAULT 'upcoming'
                         CHECK (status IN ('upcoming','active','ended','cancelled','archived')),
    started_at           TEXT,
    ended_at             TEXT,
    qr_token             TEXT,
    qr_token_expires_at  TEXT,
    created_by           TEXT NOT NULL REFERENCES users(id),
    created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX idx_sesi_kelas        ON sesi(kelas_id);
CREATE INDEX idx_sesi_status_date  ON sesi(status, tanggal);
CREATE INDEX idx_sesi_tanggal      ON sesi(tanggal);
```

### 3.2 `sesi_attendances`

```sql
CREATE TABLE sesi_attendances (
    sesi_id              TEXT NOT NULL REFERENCES sesi(id)  ON DELETE CASCADE,
    user_id              TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status               TEXT NOT NULL CHECK (status IN ('hadir','izin','sakit','alfa')),
    recorded_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    recorded_by_user_id  TEXT REFERENCES users(id),  -- NULL → self via QR
    via_qr               INTEGER NOT NULL DEFAULT 0 CHECK (via_qr IN (0,1)),
    notes                TEXT,
    PRIMARY KEY (sesi_id, user_id)
);

CREATE INDEX idx_sesi_attend_user   ON sesi_attendances(user_id);
CREATE INDEX idx_sesi_attend_status ON sesi_attendances(status);
```

### 3.3 `sesi_chat_messages`

```sql
CREATE TABLE sesi_chat_messages (
    id          TEXT PRIMARY KEY,
    sesi_id     TEXT NOT NULL REFERENCES sesi(id) ON DELETE CASCADE,
    user_id     TEXT NOT NULL REFERENCES users(id),
    body        TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX idx_sesi_chat_sesi_created ON sesi_chat_messages(sesi_id, created_at);
```

### 3.4 `sesi_notes`

```sql
CREATE TABLE sesi_notes (
    id              TEXT PRIMARY KEY,
    sesi_id         TEXT NOT NULL REFERENCES sesi(id) ON DELETE CASCADE,
    author_user_id  TEXT NOT NULL REFERENCES users(id),
    body            TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_sesi_notes_sesi ON sesi_notes(sesi_id);
```

### 3.5 `sesi_tugas`

```sql
CREATE TABLE sesi_tugas (
    id                  TEXT PRIMARY KEY,
    sesi_id             TEXT NOT NULL REFERENCES sesi(id) ON DELETE CASCADE,
    assigned_user_id    TEXT NOT NULL REFERENCES users(id),
    created_by_user_id  TEXT NOT NULL REFERENCES users(id),
    body                TEXT NOT NULL,
    due_at              TEXT,
    status              TEXT NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open','submitted','reviewed','cancelled')),
    submitted_at        TEXT,
    submission_body     TEXT,
    reviewed_at         TEXT,
    reviewer_user_id    TEXT REFERENCES users(id),
    feedback            TEXT,
    created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_sesi_tugas_sesi ON sesi_tugas(sesi_id);
CREATE INDEX idx_sesi_tugas_user ON sesi_tugas(assigned_user_id);
```

## 4. Scheduler

A small in-process ticker promotes upcoming sesi to active and active sesi to ended.

### 4.1 Package layout

```
internal/scheduler/
├── scheduler.go    // Scheduler struct, Start/Stop, tick loop
├── job_sesi.go     // Job that flips sesi statuses
└── scheduler_test.go
```

### 4.2 Sketch

```go
package scheduler

import (
    "context"
    "log/slog"
    "time"
)

type Scheduler struct {
    interval time.Duration
    jobs     []Job
    stop     chan struct{}
    log      *slog.Logger
}

type Job interface {
    Name() string
    Run(ctx context.Context) error
}

func New(interval time.Duration, log *slog.Logger, jobs ...Job) *Scheduler {
    return &Scheduler{interval: interval, jobs: jobs, stop: make(chan struct{}), log: log}
}

func (s *Scheduler) Start(ctx context.Context) {
    t := time.NewTicker(s.interval)
    go func() {
        defer t.Stop()
        for {
            select {
            case <-ctx.Done():
                return
            case <-s.stop:
                return
            case <-t.C:
                for _, j := range s.jobs {
                    if err := j.Run(ctx); err != nil {
                        s.log.Error("scheduler job failed", "job", j.Name(), "err", err)
                    }
                }
            }
        }
    }()
}

func (s *Scheduler) Stop() { close(s.stop) }
```

### 4.3 Sesi lifecycle job

```go
type SesiLifecycleJob struct {
    sesi *store.Sesi
    bus  realtime.Publisher // optional; see doc 30
}

func (j *SesiLifecycleJob) Name() string { return "sesi.lifecycle" }

func (j *SesiLifecycleJob) Run(ctx context.Context) error {
    now := time.Now().UTC()
    if err := j.sesi.PromoteToActive(ctx, now); err != nil { return err }
    if err := j.sesi.PromoteToEnded(ctx, now); err != nil { return err }
    return nil
}
```

The store methods:

```go
// PromoteToActive flips upcoming sesi whose tanggal+jam_mulai is in the past.
func (s *Sesi) PromoteToActive(ctx context.Context, now time.Time) error {
    rows, err := s.db.QueryContext(ctx, `
        SELECT id, kelas_id FROM sesi
        WHERE status = 'upcoming'
          AND datetime(tanggal || 'T' || jam_mulai || ':00Z') <= ?
        LIMIT 100
    `, now.Format(time.RFC3339))
    // ... iterate, UPDATE status='active', started_at=now ...
    // ... emit event "sesi:started" to kelas room ...
}
```

### 4.4 Interval

Default tick interval: **30 seconds**. Configurable via env `SCHEDULER_INTERVAL` (Go duration). The job is idempotent so missing a tick is harmless.

### 4.5 Single-instance assumption

The scheduler runs in-process. If ppgus ever scales to multiple replicas:

1. **Leader election** via a tiny `scheduler_leader` table with a heartbeat row.
2. **External cron** (a sidecar cron container) calls `/api/internal/scheduler/tick` with a shared-secret header.

Document both; ship option 1's hook (no-op when only one instance) so multi-instance is a config flip later.

## 5. API contract

### 5.1 Sesi CRUD

| Method | Path | Body / Query | Notes |
|---|---|---|---|
| GET | `/api/sesi` | `?kelasId=&status=&dateFrom=&dateTo=&limit=&offset=` | scoped |
| GET | `/api/sesi/{id}` | — | includes counts, attendance summary |
| POST | `/api/sesi` | `{ kelasId, materiId?, tanggal, jamMulai, jamSelesai? }` | guru / pengurus / admin |
| PATCH | `/api/sesi/{id}` | partial | not allowed when `status='ended'` |
| DELETE | `/api/sesi/{id}` | — | admin only (sets `status='archived'`) |
| POST | `/api/sesi/{id}/start` | — | explicit promote to active |
| POST | `/api/sesi/{id}/end` | — | explicit promote to ended |
| POST | `/api/sesi/{id}/cancel` | `{ reason? }` | |
| POST | `/api/sesi/{id}/reopen` | — | from cancelled → upcoming |

### 5.2 Attendance

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/api/sesi/{id}/attendances` | — | full roster + status |
| PUT | `/api/sesi/{id}/attendances/{userId}` | `{ status, notes? }` | guru records |
| POST | `/api/sesi/{id}/attendances/self` | `{ qrToken }` | murid records via QR — see [23](./23-qr-attendance.md) |
| POST | `/api/sesi/{id}/attendances/bulk` | `{ updates: [{ userId, status }] }` | bulk |
| GET | `/api/sesi/{id}/attendance-summary` | — | counts by status |

### 5.3 Chat / notes / tugas

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/api/sesi/{id}/messages` | `?before=&limit=` | paginated |
| POST | `/api/sesi/{id}/messages` | `{ body }` | enrolment-gated |
| GET | `/api/sesi/{id}/notes` | — | guru-only |
| POST | `/api/sesi/{id}/notes` | `{ body }` | guru-only |
| PATCH | `/api/sesi/{id}/notes/{noteId}` | `{ body }` | author-only |
| GET | `/api/sesi/{id}/tugas` | — | list homework for this sesi |
| POST | `/api/sesi/{id}/tugas` | `{ assignedUserIds: [...], body, dueAt? }` | guru |
| POST | `/api/sesi-tugas/{id}/submit` | `{ submissionBody }` | murid |
| POST | `/api/sesi-tugas/{id}/review` | `{ feedback, status }` | guru |

## 6. Validation rules

`CreateSesiRequest`:

| Field | Rule |
|---|---|
| `kelasId` | `required,ulid` |
| `materiId` | `omitempty,ulid` |
| `tanggal` | `required,datetime=2006-01-02` |
| `jamMulai` | `required,datetime=15:04` |
| `jamSelesai` | `omitempty,datetime=15:04` |

Cross-field:

- `jam_selesai > jam_mulai` (validate after parse).
- The kelas must be `status='active'`.
- The creator must be the kelas's guru, or have role admin / pengurus in that scope.

## 7. Cross-cutting hooks

- **Audit log**: every state transition and attendance change recorded.
- **Notifications** ([32](./32-notifications.md)): on `sesi.started`, notify enrolled murid; on `sesi.cancelled`, notify everyone; on `tugas.assigned`, notify assignee.
- **Real-time** ([30](./30-real-time-websockets.md)): emit `sesi:started`, `sesi:ended`, `sesi:attendance_updated`, `sesi:message_new` to a per-sesi room and a per-kelas room.
- **QR attendance** ([23](./23-qr-attendance.md)): the `qr_token` and `qr_token_expires_at` fields are populated when guru opens the "QR proof" panel.

## 8. Frontend impact

`web/app/src/api/sesi.ts` provides hooks.

New SPA routes:

- `/_authed/kelas/$kelasId/sesi/$sesiId` — the **Ruang Sesi** page (mirrors sitrac-v3's `/kelas/:id/sesi`). Sub-tabs: roster + attendance, chat, notes, tugas.
- `/_authed/me/sesi-today` — murid's "Hari Ini" view.
- `/_authed/me/sesi/upcoming` — full schedule.

The Ruang Sesi page polls the sesi every 5 s in absence of real-time (Phase 2), and subscribes via WebSocket once [30](./30-real-time-websockets.md) ships.

## 9. Test plan

`internal/store/sesi_test.go`:

- Create with `jam_selesai < jam_mulai` → error.
- Transitions enforced: cannot `end` from `upcoming` without first `start`.
- `PromoteToActive` is idempotent.
- Cancelling an active sesi sets attendance rows to `alfa` for non-recorded users (configurable, default off).

`internal/store/sesi_attendances_test.go`:

- `via_qr=1` requires `recorded_by_user_id IS NULL`.
- Bulk attendance is transactional.

`internal/scheduler/scheduler_test.go`:

- Tick fires all registered jobs once.
- Stop halts the loop.
- Job error is logged but does not crash the loop.

`internal/handler/sesi_test.go`:

- Murid cannot POST `/messages` for a sesi they are not enrolled in.
- Guru can cancel; pengurus in same scope can; pengurus in other scope cannot.

## 10. Open questions

- **Recurring sesi**: do we want "Caberawit California meets every Saturday 09:00"? Recommendation: separate `sesi_recurrences` table later; v1 is one-off sesi.
- **Late/early-end policies**: should a sesi auto-`end` if no attendance is recorded after N minutes? Configurable, default off.
- **Re-attendance**: can a murid record attendance after sesi has ended? Default no; admin override only.
