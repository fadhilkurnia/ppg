---
topic: executive overview
depends-on: []
enables: [all-other-docs]
key-concepts: [gap-analysis, additive-evolution, hybrid-architecture, gnrs-alignment]
---

# 01 — Overview

## TL;DR

**ppgus** is a small, well-built Go + SQLite + embedded React SPA for a four-region mentorship program. It models **students**, **teachers**, and **attendance sessions**. Three sibling projects — **sitrac**, **sitrac-v3**, and **gnrs** — model a much richer education domain: **classes (kelas), materials (materi), sessions (sesi), scope hierarchy, role delegation, attendance with QR proof, parent-child relationships, curriculum planning, progress tracking, real-time presence and chat, file uploads, notifications, audit logs, bulk CSV operations**, and **persona-first dashboards**.

The gnrs Vue 3 frontend on Cloudflare Workers already expects a `ppgus`-shaped backend on port `8080` (`API_ORIGIN=http://127.0.0.1:8080`) with endpoints such as `/kelas/*`, `/materi/*`, `/sesi/*`, `/role/*`, `/scope/*` that **ppgus does not currently expose**. Closing this gap is the most concrete and high-leverage path.

This documentation set captures the gaps and how to close them — additively, on a feature branch, without breaking the existing students/teachers/attendances API.

---

## 1. Why this document set exists

The user requested a comprehensive comparison of `ppgus` against `sitrac`, `sitrac-v3`, and `gnrs`, plus detailed implementation guides for the missing features. Per `ppgus/RULES.md`:

> *You must not change anything in this repository directly. You must create a new branch and wait for other contributors to agree to merge those changes into the main branch.*

Therefore:

- All work lives on branch `docs/missing-features-analysis`.
- No code under `cmd/`, `internal/`, or `web/` is modified.
- Documentation is the only artifact.
- Guides are precise enough that a future developer (human or LLM) can execute them without re-reading the source codebases.

## 2. What each sibling project teaches us

### 2.1 sitrac

A full PPG (Pesantren Pendidikan Guru) LMS for Indonesian Islamic education. Stack: React + Express + Prisma + PostgreSQL + Socket.IO + LiveKit. Has **20+ Prisma entities**, **25 REST endpoint families**, Socket.IO events (`sesi:mulai`, `pencapaian:update`, `chat:new`), 5-role RBAC (admin / pengurus / guru / ortu / murid), media bank (220 MB uploads), curriculum planning, Qur'an / Hadits / Doa progress tracking, raport (report cards), bulk CSV imports, activity log, notifications, parent dashboards. Most feature-complete reference.

### 2.2 sitrac-v3

Same backend as sitrac, but a **persona-first frontend redesign**: each role gets a "Hari Ini" dashboard variant (Guru / Murid / Ortu / Admin). 18 React routes. Consolidates `Ruang Kelas + Ruang Ajar + Sesi Panel` into one `/kelas/:id` page. Consolidates Qur'an + Doa + Hadits + Asmaul Husna into `/pustaka`. Mobile-first navigation with a bottom-tab bar below 820 px. Useful as the **UX reference** for what ppgus's frontend could grow into.

### 2.3 gnrs

A Vue 3 SPA deployed as a Cloudflare Worker. The Worker is a security gateway:

- HttpOnly cookies (`gnrs_access`, `gnrs_refresh`) — tokens never reach browser JS.
- **Dynamic per-session API path** (e.g. `/a3f8d2e1b9c7/*`) injected into the HTML, defeating naive CSRF.
- Worker-to-backend authentication via `X-GNRS-Worker-Auth: <shared-secret>`.

Domain model: users with `scope` (Indonesian geographic hierarchy), classes (`kelas`), class templates (`kelas_template`), materials (`materi`) with `basis_penilaian` (skill vs completion), material assignments with grade tracking, sessions (`sesi`) with `status` (upcoming / active / ended) and QR attendance proof. Bulk CSV CRUD for users, classes, materials, sessions. i18n (en / id).

**Critical observation:** the gnrs frontend's `API_ORIGIN` defaults to `http://127.0.0.1:8080` in dev — the exact port `ppgus` listens on. The endpoint families it consumes are precisely the gap. This documentation set treats gnrs's API contract as the **canonical target shape** for ppgus.

## 3. First principles for closing the gap

1. **Additive, not destructive.** New tables, new endpoints, new packages. Do not modify the existing `students`, `teachers`, `attendances` schema except by purely additive migrations.
2. **Go idioms only.** No microservices, no new languages, no JS backend code. Where sitrac uses Express + Prisma, ppgus uses chi + raw SQL (matching the existing pattern).
3. **SQLite-first.** Stay on SQLite for as long as possible. WAL mode, busy-timeout tuning, and content-addressed blob storage carry it far. PostgreSQL migration is a separate, optional track ([`60-testing-and-migration.md`](./60-testing-and-migration.md)).
4. **Embedded SPA stays.** Keep `go:embed` of `web/dist/`. New frontend routes are added in `web/app/src/routes/`. No additional build artifacts.
5. **Coding style matches existing code.** Receivers like `(h *Students)`, `slog.Info(...)` JSON logs, `httpx.Error(...)` responses, `validator/v10` tags, ULID primary keys, `created_at` / `updated_at` on every table.
6. **One feature per migration.** Migration numbering continues from `010_*`. Each new feature ships with its own paired `.up.sql` / `.down.sql`.
7. **Tests in the same place.** New store packages get `*_test.go` files following the existing table-driven, `t.TempDir()` pattern.
8. **Bilingual domain terms preserved.** `kelompok`, `desa`, `daerah`, `kelas`, `sesi`, `materi`, `pencapaian`, `raport`, `ortu`, `murid`, `guru`, `pengurus` stay as-is. Code identifiers may transliterate (`kelompok` → `kelompok`, `daerah` → `daerah`) but never translate.

## 4. The gap, in one paragraph

ppgus currently models **who** (users, students, teachers) and **when** (attendance dates) but lacks **what** is being taught (materials), **where in a curriculum plan** it sits, **which group** is being taught (classes vs. ad-hoc pairings), **lifecycle of a teaching event** (sessions with start/end states and QR proofs), **how progress is graded over time** (assignments, achievements, raport), **who else cares** (parents linked to children, notifications, audit log), **what scopes a user can manage** (manageable-roles delegation across the daerah/desa/kelompok hierarchy), and **how to onboard a new organization at scale** (bulk CSV). The frontend lacks the **persona-first dashboards** and **mobile-first navigation** the others have, and the security model lacks the **dynamic per-session API path** that gnrs's worker uses.

## 5. Suggested reading order

If you are building a single feature, read in this order:

1. [`02-comparison-matrix.md`](./02-comparison-matrix.md) — confirm the gap is real.
2. [`10-domain-model-evolution.md`](./10-domain-model-evolution.md) — see where your entity fits in the schema.
3. The specific feature guide (one of `11`–`53`).
4. [`60-testing-and-migration.md`](./60-testing-and-migration.md) — ship safely.
5. [`90-roadmap.md`](./90-roadmap.md) — confirm prerequisites are done.

If you are planning a release, read 02 → 90 → individual files in priority order.

## 6. What we will *not* propose

- **Replacing SQLite with PostgreSQL** as a blocking step. We document the migration in [`60`](./60-testing-and-migration.md) but treat it as optional.
- **Adding LiveKit** for in-call video. ppgus's audience does not yet need it; the doc set captures it as a phase-4 nice-to-have.
- **Rewriting the React SPA in Vue.** The gnrs frontend exists and is owned elsewhere; ppgus's SPA stays React.
- **Switching from JWT to session-store auth.** We harden the JWT-in-cookie pattern instead ([`50`](./50-security-hardening.md)).
- **Adopting a queue (Asynq, NATS, Redis Streams) up front.** A simple in-process scheduler (the `internal/scheduler` package proposed in [`22`](./22-sesi-system.md)) is enough for the workloads ppgus will see. We document where to swap it later.

## 7. Glossary teaser

A full glossary lives in [`99-glossary.md`](./99-glossary.md). The terms you will encounter most often:

- **Kelompok** — congregation / cell; one of the four regions in ppgus today (California, Chicago, New Hampshire, Canada). In a larger scope hierarchy, also the smallest unit.
- **Desa** — village / branch; intermediate level.
- **Daerah** — region; top level.
- **Kelas** — class / cohort; a group of students taught by a guru.
- **Sesi** — session; a scheduled teaching event with start/end, attendance, materials, chat.
- **Materi (Ajar)** — learning material; assigned to students with a grading basis.
- **Pencapaian** — achievement; the grade or status a student has for a material.
- **Raport** — report card; aggregation of pencapaian per semester.
- **Ortu** — short for *orang tua*; parent.
- **Murid** — student / pupil.
- **Guru** — teacher.
- **Pengurus** — staff / administrator (between guru and full admin).
- **Generus** — the student community served by PPG (Pengajian Generus).
