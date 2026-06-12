# Live Stage — Auto-hide Header/Footer (more space for materi)

- **Date:** 2026-06-06
- **Status:** Approved (design) — pending spec review
- **Track:** `gnrs-evan`
- **Scope:** Frontend only — `web/app/src/pages/LiveSesi.tsx` + i18n (`locales/en.json`, `locales/id.json`)

## Problem / context

The live session "stage" (`LiveSesi.tsx`) is a fullscreen overlay
(`fixed inset-0 z-50 flex flex-col`) with three regions:

- a top **header** — back, live/done/pre status badge, topik + tingkat, elapsed
  timer, End-sesi button (`LiveSesi.tsx:168`);
- a flexible **Stage** (`<main>`) that renders the current materi (`:213`);
- a bottom **footer** toolbar — pick/replace materi, display-mode buttons
  (full / title / hidden), history, fullscreen (`:223`).

During teaching the materi is the focus, but the header and footer permanently
consume vertical space. The teacher wants more room for the materi, with the
chrome appearing only when needed.

Note: the existing `liveDisplayMode` (full / title / hidden, server-synced via
`setSesiLive`) controls how the *materi itself* is rendered (e.g. `hidden`
blanks the stage). This feature is a **separate axis**: it hides the *chrome*
(header/footer) while keeping the materi. The two do not interact.

## Goal

Add an opt-in "auto-hide" mode to the live stage that, after a short idle
period, slides the header and footer off-screen so the materi fills the
viewport, and brings them back instantly on any pointer / touch / key activity.

## Non-goals

- No change to `liveDisplayMode` / materi rendering.
- Not server-synced — this is a per-operator viewing preference, not shared
  session state.
- No per-bar configuration (header vs footer independently). Both bars hide
  together.
- No change to the Go backend, DB schema, or API.

## Chosen approach — Overlay + fade (Approach A)

Restructure the stage so the materi `<main>` is a full-viewport canvas and the
header/footer are absolutely-positioned overlays on its top/bottom edges,
toggled with an opacity + translate transition. Because the materi canvas size
never changes when the chrome toggles, the embedded paginated readers (Quran
mushaf, Tilawati) never re-paginate.

Alternatives considered and rejected:

- **B — Collapse + reflow:** animate header/footer height to 0 so the flex
  Stage grows. Rejected: reflows the flex container on every hide/reveal,
  re-laying-out the paginated readers (a visible jump) every few seconds.
- **C — Fullscreen-only hide:** hide chrome only in browser fullscreen.
  Rejected: not "auto-hide on idle"; many teachers don't use fullscreen.

## Layout change

Current: `fixed inset-0 z-50 flex flex-col` with header / main(`flex-1`) /
footer in normal flow.

New structure (the container becomes the positioning context; the Stage is the
base layer, chrome floats over it):

```
<div className="fixed inset-0 z-50 bg-neutral-950 text-neutral-100">
  <main   className="absolute inset-0 overflow-hidden">…Stage…</main>
  <header className="absolute inset-x-0 top-0    z-10 …transition…">…</header>
  <footer className="absolute inset-x-0 bottom-0 z-10 …transition…">…</footer>
  …overlays (picker / end / replace / history) at a higher z-index…
</div>
```

Visibility classes (driven by `chromeVisible`):

- shown: header `translate-y-0 opacity-100`, footer `translate-y-0
  opacity-100`, both `pointer-events-auto`.
- hidden: header `-translate-y-full opacity-0`, footer `translate-y-full
  opacity-0`, both `pointer-events-none`.
- transition: `transition-all duration-300 ease-out` (skipped when
  `prefers-reduced-motion: reduce`).

The header/footer keep their existing translucent
`bg-neutral-900/80 backdrop-blur`, so while visible the small overlapped strip
of materi stays faintly legible. The Stage content components
(`KurikulumStage`, `QuranStage`, `TilawatiStage`, `DoaStage`, `HaditsStage`,
title/hidden views) are unchanged.

## Behavior / state model

Three pieces of state in `LiveSesiPage`:

- `autoHide: boolean` — is the feature enabled? Initialized from localStorage
  (default `false`), persisted on change.
- `chromeVisible: boolean` — are the bars currently shown? Default `true`.
- an idle-timer handle (`window.setTimeout`), held in a ref.

Rules:

1. **Auto-hide is engaged** when ALL of: `autoHide === true`, materi is on stage
   (`current !== null`), and no overlay is open
   (`!pickerOpen && !endOpen && !replaceConfirm && !historyOpen`).
2. When engaged: start/restart a `HIDE_DELAY_MS` (3000 ms) timer; on expiry set
   `chromeVisible = false`.
3. **Activity** — `mousemove`, `pointerdown`, `touchstart`, `keydown` on
   `window` — sets `chromeVisible = true` and restarts the timer (while
   engaged).
4. **Not engaged** (feature off, no materi, or an overlay open): clear the timer
   and force `chromeVisible = true`.
5. Cleanup the timer and listeners on unmount / when deps change (useEffect
   cleanup) so nothing leaks when navigating away or ending the sesi.

Implementation note: encapsulate this in a small local hook
`useAutoHideChrome({ enabled, suspended })` returning `{ chromeVisible }` and
owning the listeners/timer, to keep `LiveSesiPage` readable.
`enabled = autoHide`, `suspended = !current || anyOverlayOpen`.

## UI — the toggle

Add one icon toggle button to the footer's right-hand control cluster, next to
the fullscreen button (`:264`).

- Icon: a panel / auto-hide glyph from `lucide-react` (e.g. `PanelTopClose`
  when on / `PanelTop` when off — final pick at implementation).
- Active (on) styling mirrors `ModeBtn`'s active look
  (`bg-emerald-500/20 text-emerald-300`); inactive uses the existing neutral
  icon-button style.
- `aria-pressed={autoHide}`, `aria-label={t('live.autoHide')}`,
  `title={t('live.autoHide')}`.
- Click flips `autoHide` and writes localStorage. No effect on
  `liveDisplayMode`.

When `autoHide` is on and the bars are hidden, the toggle is hidden with the
footer; the teacher reveals it by moving the mouse / tapping, then can toggle
off. This is acceptable and discoverable (matches video-player chrome).

## Persistence

- Key: `gnrs.live.autoHideChrome` (dot-namespaced, matching
  `gnrs.sidebar.collapsed`).
- Value: `'1'` / `'0'` (matching the sidebar-collapsed convention).
- Read once on mount (lazy `useState` initializer, guarded for absent
  `localStorage`); written in the toggle handler.
- Default `false` (opt-in) — existing behavior is unchanged for anyone who
  doesn't enable it.

## i18n

Add to the `live` block of both `locales/en.json` and `locales/id.json`:

- `live.autoHide` — en: `"Auto-hide bars"`, id: `"Sembunyikan bilah otomatis"`.

(One key; the toggle is icon-only with this as its label/tooltip.)

## Accessibility / edge cases

- `prefers-reduced-motion: reduce` → drop the slide/fade; toggle visibility
  instantly.
- While hidden, bars get `pointer-events-none` and `aria-hidden` so they can't
  be clicked or focused; revealing restores them.
- Overlays (picker / end / replace / history) always force chrome visible and
  pause the timer, so the teacher never loses controls mid-interaction.
- No materi yet (`current === null`): chrome stays visible regardless of the
  toggle (the "pick materi" CTA must be reachable).
- Touch: first tap reveals; subsequent taps interact normally.
- Timer/listener cleanup on unmount prevents leaks.

## Testing

- `make test` and `make typecheck` (from the worktree).
- Chrome DevTools flow per `TEST.md` against a local dev container (or the
  operator's `gnrs` container on `:8300` if they ask to rebuild):
  1. Open a live sesi with materi on stage.
  2. Enable the auto-hide toggle → after ~3 s both bars slide away; materi fills
     the screen.
  3. Move the mouse / tap → both bars return instantly; idle again → they hide
     again.
  4. Open the materi picker (and history) → bars stay visible while open; close
     → idle behavior resumes.
  5. Disable the toggle → bars stay permanently visible (today's behavior).
  6. Reload the page → the toggle state is remembered.
  7. Confirm Quran mushaf / Tilawati materi does not re-paginate when the bars
     toggle.
- Capture before/after for the PR's "Tested via Chrome DevTools" section.

## Implementation / workflow notes

- Track `gnrs-evan`. Worktree `.claude/worktrees/live-autohide`, branch
  `feat/live-autohide` (already created to hold this spec).
- Suggested step-by-step commits:
  1. `docs(live): add auto-hide chrome design spec` (this file).
  2. `feat(live): make stage a full-canvas with overlay chrome` (layout only,
     no behavior change yet).
  3. `feat(live): add idle auto-hide behavior and toggle` (hook, state, button).
  4. `feat(live): persist auto-hide preference in localStorage`.
  5. `i18n(live): add auto-hide strings (en, id)`.
- PR targets `gnrs-evan`. Clean up the worktree + branch + dev container after
  merge, per `CLAUDE.md`.

## Open questions

None outstanding. Scope (both bars), approach (overlay), and default
(off / opt-in) are decided. The reveal trigger was revised after first testing —
see the revision below.

## Revision 2026-06-07 — edge-reveal + per-mode layout

After dogfooding the first implementation, the operator requested two changes.
These supersede the **Behavior / state model** and **Layout change** sections
above.

### 1. Reveal is edge-triggered, not idle-timed

The idle timer (`useAutoHideChrome`, 3 s, reveal on any
mousemove/pointerdown/touchstart/keydown) is replaced by `useEdgeChrome`:

- When auto-hide is on and not suspended, the header and footer start hidden and
  reveal **independently by edge proximity**: the header only when the pointer is
  within `EDGE_REVEAL_PX` (36 px) of the **top** edge, the footer only within
  36 px of the **bottom** edge.
- Typing (no `keydown` listener) and moving the mouse through the centre never
  reveal the bars.
- Mouse: a window `pointermove` reveals the relevant bar; the bar hides on its
  own `pointerleave`. (`EDGE_REVEAL_PX` is kept smaller than a bar's height so a
  revealed bar's own pointer-leave can't immediately re-trigger the edge zone.)
- Touch: a `pointerdown` within an edge zone reveals that bar, which auto-hides
  after `TOUCH_REVEAL_MS` (3500 ms), since touch has no hover-out.
- Suspended (a dialog/history open, or no materi on stage) or disabled forces
  both bars visible.

There are no overlay hot-zone `<div>`s — reveal is driven by a window-level
listener, so the materi underneath stays fully interactive.

### 2. Layout depends on the mode

The overlay layout is now applied **only when auto-hide is on**:

- **Auto-hide off** → the original flow layout: container `flex flex-col`,
  header / `main` (`flex-1`) / footer in normal flow. The materi is contained
  **between** the bars (no overlap).
- **Auto-hide on** → overlay layout: `main` is `absolute inset-0` (full-screen
  canvas) and the bars are `absolute` overlays that float **over** the materi.

Consequence: hover-revealing a bar no longer resizes the materi canvas (so the
Qur'an/Tilawati readers never re-paginate on reveal). The canvas only resizes on
the deliberate on/off toggle, which is acceptable.

The `live.autoHide` i18n string, the persisted `gnrs.live.autoHideChrome` toggle
(default off), `motion-reduce` handling, and `aria-hidden` / `pointer-events-none`
on hidden bars are unchanged.
