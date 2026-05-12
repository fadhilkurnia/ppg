---
topic: phased delivery roadmap
depends-on: [02-comparison-matrix.md]
enables: []
key-concepts: [milestones, dependency-order, exit-criteria, parallel-tracks]
---

# 90 — Roadmap

## TL;DR

Three phases (call them milestones M1, M2, M3) deliver everything documented in 11–51. Each milestone has explicit **exit criteria** that can be checked off in a PR description. Phases can overlap in time if multiple developers / agents are working in parallel, but each milestone's exit criteria gate the next.

Estimated effort assumes one full-time engineer familiar with the existing Go + React stack. Adjust freely.

---

## Milestone M1 — Foundations (≈ 4 weeks)

Goal: ppgus speaks the gnrs API contract for the basic entities; security posture upgraded.

### Deliverables

- Migrations `011`–`016` ship: `scopes`, `user_scopes`, `roles`, `user_roles`, `kelas`, `kelas_enrollments`, `materi`, `materi_assignments`, `sesi`, `sesi_attendances`.
- Store packages and handlers for each above.
- `/api/auth/verify`, `/api/auth/refresh` (with refresh-cookie rotation).
- Manageable-roles enforcement (admin / pengurus / guru / ortu / murid).
- Scope-aware filtering in all list endpoints.
- Sesi lifecycle scheduler with `upcoming → active → ended`.
- Secure headers, login lockout, per-IP rate limit on auth.
- Snapshot tests for legacy endpoints (`/students`, `/teachers`, `/attendances`, `/stats`) green.

### Exit criteria

- [ ] gnrs frontend pointing at this ppgus instance can: log in, list users, list kelas, create a kelas, create a sesi, mark a sesi started, end the sesi, fetch user list.
- [ ] All legacy SPA pages (`/dashboard`, `/students`, `/teachers`, `/attendance`, `/sessions`) work unchanged.
- [ ] `make test` passes; smoke test (`go test -tags=smoke`) passes.
- [ ] Production migration on a copy of `data/app.db` succeeds; `/healthz` is green.

### Risks / unknowns

- Scope hierarchy seeding for the existing four kelompok requires product input on desa grouping. Treat the suggested seed in [11](./11-scope-hierarchy.md) §5 as a starting point.
- Existing `students.kelompok` text values must remain readable; the additive `scope_id` column is correct, but readers must keep reading the text column until the bulk of code is on the new column.

### Dependency graph

```
011 scopes ─┐
            ├─► 013 kelas ──► 015 materi ──► 016 sesi ──► (M1 done)
012 roles ──┘
                                 ▲
                                 │
014 kelas_templates (after materi)
50 security hardening (parallel — independent of schema)
```

---

## Milestone M2 — Engagement (≈ 3 weeks)

Goal: real-time, chat, notifications, audit, bulk CSV, QR.

### Deliverables

- Migrations `017`–`020`.
- `internal/realtime/` package with WS hub.
- `internal/audit/` with `Recorder`.
- `internal/notify/` with persistent + WS delivery.
- `internal/bulk/` with HTTP CSV import/export for every entity.
- `internal/storage/` blob layer + `media_bank`.
- QR attendance endpoints + UI scanner / display.
- Notification bell + per-resource history pages in the SPA.

### Exit criteria

- [ ] A guru can start a sesi, display a QR; a murid can scan and be marked present in real time.
- [ ] A grade change is reflected in the murid's raport view within 1 s on a connected SPA.
- [ ] An admin can CSV-import 200 murid in one request and see per-row outcomes.
- [ ] Admin audit-log view shows every kelas / materi / sesi action with actor and IP.
- [ ] Notification bell badge updates without polling.

### Parallelism

- Real-time WS + chat can develop independently of audit / notifications.
- Bulk CSV is independent of all of the above.
- QR is independent except for the sesi schema (already done in M1).

### Risks

- WebSocket connection survival behind reverse proxies (Cloudflare Tunnel). Test the WSS path early.
- Bulk CSV memory footprint for large files; honour the streaming pattern in [24](./24-bulk-operations.md).

---

## Milestone M3 — Domain depth (≈ 6 weeks, optional pieces)

Goal: domain features (curriculum, raport, parent), frontend polish.

### Deliverables

- Migrations `021`–`025` (ortu_murid, rencana_*, quran/hadits progress, compact_ajar, system_settings).
- Raport aggregator + printable view + PDF.
- Parent dashboard.
- Persona-first homes (admin / pengurus / guru / ortu / murid).
- i18n (id / en) wiring.
- PWA manifest + service worker.
- (Optional) email notifications.
- (Optional) PostgreSQL track per [60](./60-testing-and-migration.md) §8.

### Exit criteria

- [ ] An ortu logs in and sees the latest grade of each child within 2 clicks of `/`.
- [ ] A murid can fetch their `raport.pdf` for the current semester.
- [ ] The SPA installs as a PWA on a mobile device; offline access to the last-seen schedule works.
- [ ] Locale switcher swaps the SPA between `id` and `en` without page reload.

### Decision points

- Whether to ship Qur'an / Hadits / Doa progress depends on product direction. If ppgus stays purely a mentorship tracker, skip M3 §40 entirely and only ship Raport + Parent + Frontend polish.

---

## Cross-cutting tracks (run continuously)

- **Tests**: ratchet coverage with every PR; require new code to add tests for at least one happy path and one failure mode.
- **Docs**: update [02](./02-comparison-matrix.md) and [10](./10-domain-model-evolution.md) when behaviour or schema changes.
- **Observability**: at the end of M2, add a tiny `/api/internal/metrics` endpoint (`expvar` or Prometheus) — not in scope of any single doc but valuable.

---

## Effort estimate summary

| Milestone | Weeks (1 FTE) | Critical path | Optional parts |
|---|---|---|---|
| M1 Foundations | 4 | scopes → roles → kelas → materi → sesi | — |
| M2 Engagement | 3 | realtime → notify → bulk → QR | media bank |
| M3 Domain depth | 6 | raport → ortu → frontend | curriculum, i18n, PWA, email, Postgres |
| **Total** | **13** | | |

Parallelism with 2 engineers cuts wall-time to ~8 weeks. The blockers are the migrations themselves (only one at a time can land cleanly without merge conflicts in the migrations folder).

---

## Per-PR checklist (paste into PR description)

- [ ] Migrations are additive and reversible.
- [ ] Snapshot tests for existing endpoints still pass.
- [ ] New endpoints have store tests + handler tests.
- [ ] Audit log entries are emitted from new mutating endpoints.
- [ ] Notification fan-out hooked where appropriate.
- [ ] Frontend changes do not break existing routes.
- [ ] CHANGELOG updated.

## When to stop

If a feature listed here does not have a customer asking for it, do not ship it. The roadmap is the *menu*, not the order.
