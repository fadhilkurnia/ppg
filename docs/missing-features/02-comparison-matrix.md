---
topic: feature comparison matrix
depends-on: [01-overview.md]
enables: [10-domain-model-evolution.md, 90-roadmap.md]
key-concepts: [feature-gap, capability-matrix, priority-tiering]
---

# 02 — Comparison Matrix

> A capability-by-capability comparison of `ppgus`, `sitrac`, `sitrac-v3`, and `fevue/frontend/gnrs`.

## TL;DR

| Bucket | Items in ppgus today | Items absent in ppgus | Doc covering the absent items |
|---|---|---|---|
| Identity & scope | users, admin/staff roles | scope hierarchy, manageable roles, ortu/murid/guru/pengurus roles | [11](./11-scope-hierarchy.md), [12](./12-user-and-roles.md) |
| Domain entities | students, teachers, attendances | kelas, kelas template, materi, materi assignment, sesi | [20](./20-kelas-system.md), [21](./21-materi-system.md), [22](./22-sesi-system.md) |
| Attendance | date-keyed manual entry | QR code proof, ephemeral tokens | [23](./23-qr-attendance.md) |
| Bulk operations | CSV import for teachers (CLI only) | API bulk import/export, per-row errors | [24](./24-bulk-operations.md) |
| Real-time | none | WebSocket presence, chat, live grade updates | [30](./30-real-time-websockets.md), [31](./31-chat-messaging.md) |
| Notifications | none | persistent notifications, badge counts | [32](./32-notifications.md) |
| Files | none | media bank, large uploads | [33](./33-file-uploads.md) |
| Audit | none | full activity log | [34](./34-audit-log.md) |
| Curriculum | none | rencana ajar, rencana bulanan, qur'an/hadits/doa progress | [40](./40-curriculum-progress.md) |
| Reporting | basic stats | raport (per-semester report cards) | [41](./41-raport-system.md) |
| Parents | none | ortu role with child progress views | [42](./42-parent-child.md) |
| Security | JWT in httpOnly cookie | dynamic API paths, shared-secret gateway, CSP | [50](./50-security-hardening.md) |
| Frontend | desktop SPA, no i18n, no PWA | persona dashboards, id/en i18n, mobile-first, PWA | [51](./51-frontend-evolution.md) |

---

## How to read the matrix

- **✓** present and complete enough that a re-implementation can use it directly as reference.
- **◐** present but partial — typically a thin or hard-coded version.
- **✗** absent.
- **n/a** not applicable to the project's role (e.g. gnrs is frontend-only so backend rows show "consumes …").

The columns describe the **state of each project on inspection**, not what could theoretically be built. They are the cost evidence for prioritising work.

## 1. Identity, accounts, and access control

| Capability | ppgus | sitrac | sitrac-v3 | gnrs (FE) |
|---|---|---|---|---|
| User table with bcrypt password | ✓ | ✓ | ✓ (same backend) | consumes `/user/*` |
| Username + email login | ✓ | ✓ | ✓ | ✓ |
| JWT issuance (HS256) | ✓ | ✓ | ✓ | proxied via worker |
| HttpOnly cookie session | ✓ | ✓ | ✓ | ✓ (HttpOnly + dynamic path) |
| Refresh token | ✗ | ✓ | ✓ | ✓ |
| Roles: admin / staff | ✓ | n/a | n/a | n/a |
| Roles: admin / pengurus / guru / ortu / murid | ✗ | ✓ | ✓ | ✓ |
| Manageable-roles delegation | ✗ | ◐ (planned in gnrs.md) | ◐ | ✓ |
| Scope hierarchy (daerah / desa / kelompok) | ✗ (free-text on student/teacher only) | ◐ (planned) | ◐ | ✓ |
| Scope-aware access control | ✗ | ✗ | ✗ | ✓ |
| Parent-child relationship | ✗ | ✓ (`OrtuMurid`) | ✓ | ◐ (UI in progress) |

Closing this row owns the bulk of [11](./11-scope-hierarchy.md) and [12](./12-user-and-roles.md).

## 2. Educational domain

| Capability | ppgus | sitrac | sitrac-v3 | gnrs (FE) |
|---|---|---|---|---|
| Students / murid | ✓ (`students` table, level + kelompok + city) | ✓ (`MuridProfile`) | ✓ | consumes |
| Teachers / guru | ✓ (`teachers` table, kelompok/desa/daerah free-text) | ✓ (`GuruProfile`) | ✓ | consumes |
| Class entity (`kelas`) | ✗ | ✓ (`Kelas` with tahun ajaran + tingkat + guru) | ✓ | ✓ (used heavily) |
| Class enrollment (many-to-many student↔class) | ✗ | ✓ | ✓ | ✓ |
| Class template (clone preset) | ✗ | ✗ | ✗ | ✓ (top feature) |
| Academic year (`tahun_ajaran`) | ✗ | ✓ | ✓ | ✗ |
| Grade level (`tingkat`) | ◐ (`level` enum on student) | ✓ (`Tingkat` table) | ✓ | ✗ |
| Material (`materi`) | ✗ | ✓ (`MateriAjar`) | ✓ | ✓ |
| Material categories (baru / lanjutan / mengulang) | ✗ | ✓ (`MateriKategori` enum) | ✓ | ✓ (`kategori`) |
| Grading basis (skill vs completion) | ✗ | ◐ (grading mode) | ◐ | ✓ (`basis_penilaian`) |
| Material assignment with grade tracking | ✗ | ✓ (`Pencapaian`) | ✓ | ✓ (`GnrsMateriAssignment`) |
| Achievement status (belum / proses / tuntas) | ✗ | ✓ | ✓ | ✓ |
| Session (`sesi`) | ◐ (attendances log a date but no event) | ✓ (`Sesi`) | ✓ | ✓ |
| Session lifecycle (upcoming / active / ended) | ✗ | ◐ | ◐ | ✓ |
| Per-session attendance | ✗ | ✓ (`Absensi`) | ✓ | ✓ |
| QR attendance proof | ✗ | ✗ | ✗ | ✓ |
| Session chat | ✗ | ✓ (`ChatMessage`) | ✓ | ✗ (yet) |
| Session notes (post-session) | ✗ | ✓ (`SesiNote`) | ✓ | ✗ |
| Session tasks / homework (`sesi_tugas`) | ✗ | ✓ (`SesiTugas`) | ✓ | ✗ |

This row owns [20](./20-kelas-system.md), [21](./21-materi-system.md), [22](./22-sesi-system.md), [23](./23-qr-attendance.md).

## 3. Curriculum & progress

| Capability | ppgus | sitrac | sitrac-v3 | gnrs (FE) |
|---|---|---|---|---|
| Monthly plan (`rencana_bulanan`) | ✗ | ✓ | ✓ | ✗ |
| Long-term plan (`rencana_ajar`) | ✗ | ✓ | ✓ | ✗ |
| Qur'an surat-range scope per class | ✗ | ✓ (`RencanaQuran`) | ✓ | ✗ |
| Per-student Qur'an scope | ✗ | ✓ (`RencanaQuranMurid`) | ✓ | ✗ |
| Per-ayat Qur'an progress | ✗ | ✓ (`ProgressQuran`) | ✓ | ✗ |
| Hadits collection progress | ✗ | ✓ (`ProgressHadist`, `HaditsManqulNote`) | ✓ | ✗ |
| Manqul notes (discussion notes per ayat/hadits) | ✗ | ✓ | ✓ | ✗ |
| Doa / Asmaul Husna catalog | ✗ | ✓ (`CompactAjar`) | ✓ | ✗ |
| Tilawati progress | ✗ | ✓ | ✓ | ✗ |
| Raport / report card | ✗ | ✓ | ✓ | ✗ |
| Grading mode (angka vs huruf) | ✗ | ✓ | ✓ | ◐ |

These items live in [40](./40-curriculum-progress.md) and [41](./41-raport-system.md). They are domain-specific to Islamic education and are *optional* for ppgus depending on product direction.

## 4. Communication and engagement

| Capability | ppgus | sitrac | sitrac-v3 | gnrs (FE) |
|---|---|---|---|---|
| Real-time transport | ✗ | ✓ (Socket.IO) | ✓ | ✗ (HTTP only) |
| Presence (online users in class) | ✗ | ✓ | ✓ | ✗ |
| Chat | ✗ | ✓ | ✓ | ✗ |
| Live grade updates | ✗ | ✓ (`pencapaian:update`) | ✓ | ✗ |
| Notification entity (in-DB) | ✗ | ✓ (`Notification`) | ✓ | ✗ |
| Notification bell UI | ✗ | ✓ | ✓ | ✗ |
| Push delivery (FCM/web push) | ✗ | ✗ (planned) | ✗ | ✗ |
| Email delivery | ✗ | ✗ | ✗ | ✗ |
| Video room (LiveKit) | ✗ | ✓ (token gen + planned embed) | ◐ (link out to v2) | ✗ |

Covered in [30](./30-real-time-websockets.md), [31](./31-chat-messaging.md), [32](./32-notifications.md).

## 5. Files, audit, and operational data

| Capability | ppgus | sitrac | sitrac-v3 | gnrs (FE) |
|---|---|---|---|---|
| File upload | ✗ | ✓ (`MediaBank`, 220 MB cap) | ✓ | ✗ |
| Image / PDF / video support | ✗ | ✓ | ✓ | ✗ |
| Content-addressed storage | ✗ | ✗ (path-based) | ✗ | ✗ |
| Quota / per-user limit | ✗ | ✗ | ✗ | ✗ |
| Audit / activity log | ✗ | ✓ (`ActivityLog`) | ✓ | ✗ |
| Soft delete (`status` columns) | ✓ | ✓ | ✓ | n/a |
| Migration tooling | ✓ (golang-migrate) | ✓ (Prisma) | ✓ | n/a |
| Embedded SPA | ✓ (`go:embed`) | ✗ (nginx serves) | ✗ | ✗ (Worker serves) |
| Health check | ✓ (`/healthz`) | ◐ | ◐ | ◐ |
| Structured logging | ✓ (slog JSON) | ◐ (morgan) | ◐ | n/a |
| Metrics / tracing | ✗ | ✗ | ✗ | ✗ |

Covered in [33](./33-file-uploads.md), [34](./34-audit-log.md).

## 6. Frontend evolution

| Capability | ppgus | sitrac | sitrac-v3 | gnrs (FE) |
|---|---|---|---|---|
| Persona-first dashboard | ✗ (single dashboard) | ◐ (one dashboard, role gating) | ✓ (4 home variants) | ◐ |
| Mobile-first bottom nav | ✗ | ✗ | ✓ | ◐ |
| i18n (id / en) | ✗ | ✗ | ✗ | ✓ |
| Right-to-left text support (Arabic) | ✗ | ✓ | ✓ | ✗ |
| Theme tokens (CSS variables) | ◐ (Tailwind) | ✓ | ✓ | ✓ |
| PWA manifest + service worker | ✗ | ✗ | ✗ | ✗ |
| Offline cache | ✗ | ✗ | ✗ | ✗ |
| QR scanner UI | ✗ | ✗ | ✗ | ✓ |
| Map visualisation | ✓ (Leaflet) | ✗ | ✗ | ✗ |

Covered in [51](./51-frontend-evolution.md).

## 7. Bulk operations and data interchange

| Capability | ppgus | sitrac | sitrac-v3 | gnrs (FE) |
|---|---|---|---|---|
| CSV teacher import (CLI) | ✓ (`server import-teachers`) | ✗ | ✗ | ✗ |
| CSV bulk POST API (users/kelas/materi/sesi) | ✗ | ◐ (some) | ◐ | ✓ (multipart upload) |
| Per-row error report | ✗ | ✗ | ✗ | ✓ |
| Bulk delete | ✗ | ◐ | ◐ | ✓ |
| CSV export | ✗ | ✗ | ✗ | ✓ |

Covered in [24](./24-bulk-operations.md).

## 8. Security posture

| Capability | ppgus | sitrac | sitrac-v3 | gnrs (FE) |
|---|---|---|---|---|
| JWT HS256 | ✓ | ✓ | ✓ | ✓ (proxied) |
| HttpOnly + SameSite=Strict cookie | ✓ | ✓ | ✓ | ✓ |
| Refresh token rotation | ✗ | ◐ | ◐ | ✓ |
| Dynamic per-session API path | ✗ | ✗ | ✗ | ✓ |
| Shared secret for worker → backend | ✗ | ✗ | ✗ | ✓ |
| CSRF protection beyond SameSite | ✗ | ✗ | ✗ | ✓ (path is the token) |
| Rate limiting | ✗ | ✗ | ✗ | ✗ |
| CSP / HSTS headers | ✗ | ✗ | ✗ | ✓ |
| Audit on sensitive actions | ✗ | ✓ | ✓ | ✗ (backend-side) |

Covered in [50](./50-security-hardening.md).

## 9. Endpoint-level gap against gnrs

The gnrs frontend's allowlist (`server/index.ts`) shows exactly which top-level paths it expects from the upstream backend. Comparing against ppgus:

| Path family | ppgus | Expected by gnrs | Required action |
|---|---|---|---|
| `/auth/login`, `/auth/logout`, `/auth/verify`, `/auth/refresh` | ◐ (login/logout/me; no verify/refresh) | ✓ | Add `verify` and `refresh`; rename `me` ↔ `verify` or add both ([12](./12-user-and-roles.md), [50](./50-security-hardening.md)) |
| `/user/*` (CRUD + bulk) | ✗ | ✓ | New routes ([12](./12-user-and-roles.md), [24](./24-bulk-operations.md)) |
| `/kelas/*` (CRUD + bulk + assign) | ✗ | ✓ | New entity ([20](./20-kelas-system.md)) |
| `/kelas-template/*` | ✗ | ✓ | New entity ([20](./20-kelas-system.md)) |
| `/materi/*` (CRUD + bulk + grade) | ✗ | ✓ | New entity ([21](./21-materi-system.md)) |
| `/sesi/*` (CRUD + lifecycle + attendance) | ✗ | ✓ | New entity ([22](./22-sesi-system.md), [23](./23-qr-attendance.md)) |
| `/role/*` (role options + manageable-roles) | ✗ | ✓ | New endpoints ([12](./12-user-and-roles.md)) |
| `/scope/*` (daerah/desa/kelompok) | ✗ | ✓ | New entity ([11](./11-scope-hierarchy.md)) |
| `/health` | ✓ (`/healthz`) | ✓ | Add `/health` alias |
| `/students/*` | ✓ | ✗ (gnrs doesn't use it) | Keep — ppgus's own UI uses it |
| `/teachers/*` | ✓ | ✗ | Keep — ppgus's own UI uses it |
| `/attendances/*` | ✓ | ✗ | Keep — ppgus's own UI uses it |
| `/stats/*` | ✓ | ✗ | Keep — ppgus's own UI uses it |

The reading is: **add new endpoints additively**; do not change the existing `students` / `teachers` / `attendances` / `stats` endpoints, which the embedded React SPA depends on.

---

## 10. Priority tiers

Each tier is independently shippable. The order minimises rework.

### Tier 1 — Unblock gnrs frontend (foundational)

1. [11 scope hierarchy](./11-scope-hierarchy.md)
2. [12 user & roles expansion](./12-user-and-roles.md)
3. [20 kelas system](./20-kelas-system.md)
4. [21 materi system](./21-materi-system.md)
5. [22 sesi system](./22-sesi-system.md)
6. [50 security hardening](./50-security-hardening.md) — only the dynamic API path piece + shared secret

### Tier 2 — Engagement and operability

7. [23 QR attendance](./23-qr-attendance.md)
8. [24 bulk CSV](./24-bulk-operations.md)
9. [34 audit log](./34-audit-log.md)
10. [32 notifications](./32-notifications.md)
11. [30 websockets](./30-real-time-websockets.md)
12. [31 chat](./31-chat-messaging.md)

### Tier 3 — Domain depth

13. [40 curriculum & progress](./40-curriculum-progress.md)
14. [41 raport](./41-raport-system.md)
15. [42 parent-child](./42-parent-child.md)
16. [33 file uploads / media bank](./33-file-uploads.md)
17. [51 frontend evolution](./51-frontend-evolution.md)

The full sequencing with checkpoints lives in [90-roadmap.md](./90-roadmap.md).
