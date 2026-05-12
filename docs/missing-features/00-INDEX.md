# Missing Features Analysis — Master Index

> **Audience:** Future maintainers of `ppgus` (human and LLM).
> **Purpose:** Enumerate features absent from `ppgus` that exist in `sitrac`, `sitrac-v3`, or `fevue/frontend/gnrs`, and provide implementation guides detailed enough to execute without re-reading the comparison codebases.
> **Status:** Documentation only. No code changes proposed in this branch. Per `RULES.md`, all merges require contributor agreement.

---

## How to read this directory

This directory is partitioned into six **phases**. Each phase builds on the previous one. Read top-to-bottom for a complete tour, or jump to a numbered file for a single capability.

| Phase | Numbers | Theme | Pre-reading |
|---|---|---|---|
| 0 — Framing | 00–02 | What is missing and why | None |
| 1 — Foundational | 10–12 | Identity, scope, roles | Phase 0 |
| 2 — Educational core | 20–24 | Classes, materials, sessions, attendance, bulk ops | Phase 1 |
| 3 — Engagement | 30–34 | Real-time, chat, notifications, files, audit | Phase 2 |
| 4 — Advanced domain | 40–42 | Curriculum, progress, raport, parents | Phase 2 |
| 5 — Cross-cutting | 50–51 | Security, frontend evolution | Any |
| 6 — Operations | 60 | Testing, migration | Any |
| Z — Plans & glossary | 90, 99 | Roadmap and terminology | After scan |

---

## File catalog

### 0 — Framing

- [`01-overview.md`](./01-overview.md) — Executive summary; why these gaps exist; first principles for closing them.
- [`02-comparison-matrix.md`](./02-comparison-matrix.md) — Feature × project matrix (ppgus vs sitrac vs sitrac-v3 vs gnrs).

### 1 — Foundational

- [`10-domain-model-evolution.md`](./10-domain-model-evolution.md) — Proposed evolution of the SQLite schema (entities, relationships, ULIDs, migrations).
- [`11-scope-hierarchy.md`](./11-scope-hierarchy.md) — `daerah → desa → kelompok` scope tree with manageable-role delegation.
- [`12-user-and-roles.md`](./12-user-and-roles.md) — Expanded role system (admin/pengurus/guru/ortu/murid) and user management endpoints.

### 2 — Educational core

- [`20-kelas-system.md`](./20-kelas-system.md) — `Kelas` (class) entity, enrollment, `KelasTemplate` cloning.
- [`21-materi-system.md`](./21-materi-system.md) — `Materi` catalog, assignments, skill-vs-completion grading, achievement status.
- [`22-sesi-system.md`](./22-sesi-system.md) — `Sesi` entity, lifecycle state machine (upcoming/active/ended), background scheduler.
- [`23-qr-attendance.md`](./23-qr-attendance.md) — QR-code attendance proof, ephemeral tokens, scanner UX.
- [`24-bulk-operations.md`](./24-bulk-operations.md) — Generic CSV import/export with per-row error reports.

### 3 — Engagement

- [`30-real-time-websockets.md`](./30-real-time-websockets.md) — WebSocket layer in Go (event bus, hub, room semantics).
- [`31-chat-messaging.md`](./31-chat-messaging.md) — In-class and in-session chat backed by the real-time layer.
- [`32-notifications.md`](./32-notifications.md) — Persistent notifications with delivery channels.
- [`33-file-uploads.md`](./33-file-uploads.md) — Media bank (PDFs, video, slide decks) with quota and content addressing.
- [`34-audit-log.md`](./34-audit-log.md) — Activity log / audit trail covering every mutating endpoint.

### 4 — Advanced domain

- [`40-curriculum-progress.md`](./40-curriculum-progress.md) — Curriculum planning (`RencanaAjar`, `RencanaBulanan`) and Qur'an / Hadits / Doa progress tracking.
- [`41-raport-system.md`](./41-raport-system.md) — Report cards (per-material, per-semester) with grading modes.
- [`42-parent-child.md`](./42-parent-child.md) — `Ortu` (parent) role with linked-child progress views.

### 5 — Cross-cutting

- [`50-security-hardening.md`](./50-security-hardening.md) — HttpOnly cookies, dynamic per-session API paths, CSRF posture, shared-secret worker auth.
- [`51-frontend-evolution.md`](./51-frontend-evolution.md) — Persona-first dashboards, i18n (id/en), PWA + offline, mobile-first navigation.

### 6 — Operations

- [`60-testing-and-migration.md`](./60-testing-and-migration.md) — Testing strategy for new features and migration patterns that avoid breaking working code.

### Z — Plans & glossary

- [`90-roadmap.md`](./90-roadmap.md) — Phased delivery plan with milestones, dependencies, exit criteria.
- [`99-glossary.md`](./99-glossary.md) — Bilingual terminology (Indonesian ↔ English) and acronyms.

---

## Conventions used in these docs

- **TL;DR** block at the top of each implementation guide — single paragraph + a 5-bullet checklist.
- **Current state** vs **Target state** sections — what ppgus has today, what the others have, what we want.
- **Data model** changes use SQL DDL and matching Go struct definitions.
- **API contract** uses the same JSON envelope already in use: `{"error": {"code": "...", "message": "..."}}` on failure; the resource on success.
- **Code examples** use Go 1.22, `log/slog`, `github.com/go-chi/chi/v5`, `github.com/golang-jwt/jwt/v5`, `github.com/mattn/go-sqlite3`, `github.com/oklog/ulid/v2` — i.e. the existing stack. New dependencies are flagged explicitly with rationale.
- **Frontend examples** target the existing React 18 + TypeScript + Vite + TanStack Router + TanStack Query stack in `web/app/`.
- **Migration files** follow the existing pattern in `internal/store/migrations/NNN_*.{up,down}.sql` and the next sequential number (current latest: `010`).
- **Cross-references** use relative links: `[scope hierarchy](./11-scope-hierarchy.md)`.
- **LLM hints**: each file leads with a frontmatter block listing `topic`, `depends-on`, `enables`, and `key-concepts` so an agent can plan reads.

---

## Source projects examined

| Project | Path | Stack | Role in analysis |
|---|---|---|---|
| **ppgus** | `/workspace/ppgus` | Go + SQLite + React/TanStack | Target — the project we are augmenting |
| **sitrac** | `/workspace/sitrac` | React + Express + Prisma + PostgreSQL + Socket.IO + LiveKit | Most feature-complete LMS reference |
| **sitrac-v3** | `/workspace/sitrac-v3` | Same backend as sitrac; frontend UX redesign | Persona-first UX reference |
| **gnrs** | `/workspace/fevue/frontend/gnrs` | Vue 3 + Vite + Cloudflare Workers | Modern security architecture and probable production frontend that already calls a `ppgus`-shaped backend |

The `gnrs` frontend defaults `API_ORIGIN` to `http://127.0.0.1:8080` in dev — the same port ppgus listens on. Several gnrs endpoints (`/kelas/*`, `/materi/*`, `/sesi/*`, `/role/*`, `/scope/*`, `/user/*`) are **not implemented in ppgus today** but are expected by that frontend. Closing those gaps is the highest-priority work.

---

## What this directory is *not*

- Not a refactor plan for existing tables. The existing `students`, `teachers`, and `attendances` tables stay. New entities are additive.
- Not a rewrite proposal. The Go + SQLite + embedded SPA architecture is fit for purpose; we extend it.
- Not a commitment to ship every feature. The roadmap ([`90-roadmap.md`](./90-roadmap.md)) flags which features unlock the most value first.
- Not authoritative on UX. Designs sketched here are starting points; product owners may iterate.
