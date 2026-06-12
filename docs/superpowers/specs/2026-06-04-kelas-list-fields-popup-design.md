# Kelas List redesign — two searchable fields + session popup

Date: 2026-06-04
Status: Approved (design)
Area: `web/app/src/pages/sections/KelasListSection.tsx` (List tab of the Kelas page)

## Problem

The Kelas **List** tab currently:

- Always shows **"Kelas Saya"** (my classes) as accordion cards.
- Hides **"Semua Kelas"** (other classes) behind a collapse/expand **dropdown toggle**
  (`showAll` state with a Chevron button).
- Expands each card **inline** to reveal its sessions, grouped by status
  (ongoing / upcoming / missed / completed).

The desired model removes the dropdown, surfaces both groups as always-visible
searchable "fields", and moves session detail into a popup.

## Goals

1. Replace the dropdown mechanism with two always-visible **fields**:
   **My Class** (top) and **Other Class** (below).
2. Each field is a **bounded, independently-scrollable** panel with a **sticky
   search bar** pinned at its top; cards scroll beneath it.
3. Each field has its **own search box** filtering its cards.
4. Clicking a class card opens a **centered modal popup** showing that class's
   sessions grouped into **In Progress · Upcoming · Missed · Done**.

Non-goals: no API/backend changes; no change to `KelasFormDialog`; no change to
the Kalender or Rencana sub-tabs; the `statusOf` bucketing logic is reused as-is.

## Layout

The List tab body becomes a vertical flex (`flex h-full min-h-0 flex-col`):
a flex-none top bar (count text + Add Kelas), then a `flex-1 min-h-0` region
holding the two fields.

```
┌─ List tab body (flex-col, min-h-0) ──────────┐
│ N kelas terdaftar               [+ Add Kelas] │  ← flex-none top bar
│ ┌ MY CLASS (flex-none, max-h-[45%]) ───────┐ │
│ │ label + count                            │ │  ← flex-none
│ │ [🔍 search my classes...]   ← sticky top │ │  ← sticky inside scroll
│ │ ┌─────────┐┌─────────┐┌─────────┐  scroll│ │
│ │ │🏫 tile  ││🏫 tile  ││🏫 tile  │  ↕      │ │
│ │ └─────────┘└─────────┘└─────────┘         │ │
│ └──────────────────────────────────────────┘ │
│ ┌ OTHER CLASS (flex-1, min-h-0) ───────────┐ │
│ │ label + count                            │ │
│ │ [🔍 search other classes...] ← sticky top │ │
│ │ ┌─────────┐┌─────────┐  scroll ↕          │ │
│ │ │🏫 tile  ││🏫 tile  │                     │ │
│ └──────────────────────────────────────────┘ │
└───────────────────────────────────────────────┘
```

- **Field rendering** is driven by the *unfiltered* split: render the My Class
  field iff `myKelas.length > 0`; render the Other Class field iff
  `otherKelas.length > 0`. The search box only filters cards *within* a field,
  so a field never appears/disappears as you type.
- **Height split:** when *both* fields render, My Class is `flex-none max-h-[45%]`
  (scrolls internally if a guru has many) and Other Class is `flex-1` (takes the
  rest). When only one field renders, it gets `flex-1` and fills the area.
- Each field: a `flex-none` header row (translated label + count badge), then a
  `flex-1 min-h-0 overflow-y-auto` scroll container. Inside the scroll container,
  a **sticky** search wrapper (`sticky top-0 z-10` with a solid `bg-slate-50`
  backing — matching the app body bg — so white cards scroll cleanly under it),
  followed by a responsive **card grid**
  (`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3`).
- The old "Semua Kelas" collapse toggle (`showAll`, Chevron button) is **removed**;
  Other Class is always rendered as its own field.
- "Add Kelas" button (admin only) stays in the top bar above both fields.
- Per-field no-match state ("no results for query"). The whole-page empty state
  ("no kelas at all") is retained.

## Card → tile (`KelasCard`)

- The card body (🏫 icon, name, subtitle `tingkat · tahun · wali`) becomes a
  single click target — an inner `<button>` — that opens the session popup for
  that class. **No live session count** is shown on the tile: `Kelas` carries no
  count field, and fetching one per card would add an N-query regression (today
  sessions load only inside the popup). Counts live in the popup.
- Admin icon buttons (👥 manage members, ✎ edit, 🗑 delete) sit absolutely
  positioned top-right of the card, as siblings of the main button (not nested —
  HTML forbids nested buttons). They are visually on top and receive their own
  clicks; the main button has right padding so its text clears the icons. Each
  icon handler also calls `e.stopPropagation()` defensively.
- The inline accordion expansion is removed entirely (no `open`/`onToggle`).

## Search

- Each field owns a `useState<string>` search value, kept inside a reusable
  `KelasField` component (one instance per field, so state is naturally isolated).
- Filtering is **client-side** over the already-loaded `listKelas({})` result —
  no new query. Match is case-insensitive against **name + guru name + tingkat**
  via a shared `matchKelas(k, query)` helper.
- The `myKelas` / `otherKelas` split is unchanged (`isMine` via `guruUserIds`);
  the search filter applies on top of each split.

## Session popup (`KelasSesiDialog`, new file in `web/app/src/components/`)

- Built on the existing `Dialog` component (centered modal, overlay) for
  consistency with the rest of the app.
- Props: `{ kelas: Kelas; isAdmin: boolean; onClose: () => void }`.
- Title (Dialog header) = `kelas.nama`. A subtitle line at the top of the body
  shows `tingkat · tahun` (+ wali when present), reusing `cardSubtitle` /
  `cardSubtitleWithWali`.
- Lazily fetches `listSesi({ kelasId: kelas.id })` (the same query used today,
  moved into the dialog; the dialog only mounts when open, so no `enabled` guard
  is needed). Query key `['kelas-sesi', kelas.id]`. The redundant `as any` cast
  on the old call is dropped (`kelasId` is in `SesiListParams`).
- Body groups sessions via `statusOf` + `buckets` into four groups rendered in
  order **In Progress (ongoing) · Upcoming · Missed · Done (completed)**, each
  with its colored status dot and a count badge. (Decision: keep `missed` as its
  own group.)
- **Add Sesi** button (admin) in the dialog body, above the buckets.
- Per-session row actions are lifted verbatim from today's expanded view:
  start, Live link (`/kelas/:kelasId/sesi/:id/live`), end, reschedule, edit,
  delete, and the click-to-review summary for ended sessions.
- The nested sub-dialogs (RescheduleSesiDialog, SesiFormDialog,
  EndSesiSummaryDialog) open layered above the popup, with the same query
  invalidation (`['kelas-sesi', kelas.id]`, `['sesi']`).
- The status helpers (`Status`, `STATUS_DOT`, `statusOf`, `localDate`, `pad2`)
  move from `KelasListSection.tsx` into this file (their only consumer after the
  refactor).

Known minor behavior: pressing Escape with a sub-dialog open closes both the
sub-dialog and the popup (both use the shared `Dialog` Escape handler). Accepted
— not worth special-casing.

## Refactor note

`KelasListSection.tsx` is ~900 lines. The session rows + bucket logic + the
session sub-dialog wiring move out of `KelasCard` into the new `KelasSesiDialog`
file. This shrinks the list file, slims `KelasCard` to a tile, and gives the
popup a single clear home. `KelasFormDialog` and the tingkat-matching helpers
stay where they are.

## i18n

New keys in `en.json` + `id.json`:

- `kelasSection.list.searchMyKelas` — placeholder for the My Class search box.
- `kelasSection.list.searchOtherKelas` — placeholder for the Other Class box.
- `kelasSection.list.noMatch` — no-results state for a field's search.

Existing status labels (`kelasSection.status.*`), the subtitle keys
(`cardSubtitle` / `cardSubtitleWithWali`), and all action keys
(`kelasSection.list.*`) are reused unchanged.

## Testing

1. `make typecheck` and `make test`.
2. Rebuild the `gnrs` container (`docker-compose up -d --build`) per operator
   preference; smoke-test `GET /healthz`.
3. Chrome DevTools flow (TEST.md) against the running app:
   - Both fields render; each scrolls independently; the search bar stays
     pinned (sticky) while cards scroll.
   - Typing in My Class search filters only My Class cards; same for Other Class.
   - No-match state appears for a query with no results.
   - Clicking a card opens the centered popup; the four buckets render with
     correct counts.
   - Admin card icons (members / edit / delete) work and do **not** open the
     popup.
   - Inside the popup, Add Sesi + per-session actions (start, Live, end,
     reschedule, edit, delete, review) all work and refresh correctly.
   - Mobile width: fields stack and stay usable; grid collapses to one column.
