# Live Stage Auto-hide Chrome — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in mode to the live session stage that auto-hides the header and footer after a few idle seconds, so the materi fills the screen; any pointer/touch/key activity reveals them again.

**Architecture:** Single-file frontend change in `LiveSesi.tsx`. Restructure the stage so the materi `<main>` is a full-viewport canvas (`absolute inset-0`) and the header/footer become absolutely-positioned overlays toggled with a Tailwind opacity+translate transition. A small `useAutoHideChrome` hook owns an idle timer and window activity listeners. A footer toggle flips the behavior; the on/off choice is persisted in `localStorage`. No reflow of the canvas ⇒ the embedded Qur'an/Tilawati readers never re-paginate.

**Tech Stack:** React 18 + TypeScript, Tailwind v3, `lucide-react` icons, `react-i18next`. Build/typecheck via Vite + `tsc`. No backend, schema, or API change.

**Spec:** `docs/superpowers/specs/2026-06-06-live-auto-hide-chrome-design.md`

---

## Testing note (read first)

This repo has **no frontend unit-test harness** — `web/app/package.json` exposes only `dev`/`build`/`preview`/`typecheck`, and there is no vitest/jest/RTL or any `*.test.tsx`. Per the repo's `CLAUDE.md` + `TEST.md`, the mandated verification for a UI feature is:

1. `make typecheck` (`tsc -b --noEmit`), and `make test` (Go — unaffected here, run to confirm nothing breaks), and
2. a scripted **Chrome DevTools** pass against the running app.

**Do not add a test framework for this feature** — that's out of scope and against the established pattern. The tasks below use typecheck + the Chrome DevTools script as their verification gates, with frequent commits per the repo's step-by-step-commit rule.

All paths below are relative to the worktree root: `/home/anchor/Podman/GNRS/.claude/worktrees/live-autohide`.

---

## File structure

| File | Responsibility | Change |
| --- | --- | --- |
| `web/app/src/pages/LiveSesi.tsx` | The live-stage page; owns layout, the new `useAutoHideChrome` hook, the auto-hide state/persistence, and the toggle button. | Modify |
| `web/app/src/locales/en.json` | English strings — add `live.autoHide`. | Modify |
| `web/app/src/locales/id.json` | Indonesian strings — add `live.autoHide`. | Modify |

---

## Task 0: Prepare the worktree to build & typecheck

The worktree already exists on branch `feat/live-autohide` with the spec committed. It has no `.env` (gitignored) and no `web/app/node_modules` yet.

**Files:** none (environment only).

- [ ] **Step 1: Copy the repo `.env` into the worktree**

```bash
cp /home/anchor/Podman/GNRS/.env /home/anchor/Podman/GNRS/.claude/worktrees/live-autohide/.env
```

- [ ] **Step 2: Install web dependencies (needed for `make typecheck`)**

Run from the worktree root:

```bash
npm --prefix web/app ci
```

Expected: completes and creates `web/app/node_modules`. (If there is no `package-lock.json`, use `npm --prefix web/app install` instead.)

- [ ] **Step 3: Baseline typecheck (confirm a clean starting point)**

```bash
make typecheck
```

Expected: exits 0 with no TypeScript errors. If it fails before any edits, stop and investigate — do not start editing on a red baseline.

---

## Task 1: Add the `live.autoHide` i18n string (en + id)

The toggle button (Task 3) uses `t('live.autoHide')`, so add the strings first.

**Files:**
- Modify: `web/app/src/locales/en.json` (inside the `"live"` block, after `"fullscreen"`)
- Modify: `web/app/src/locales/id.json` (inside the `"live"` block, after `"fullscreen"`)

- [ ] **Step 1: Add the English string**

In `web/app/src/locales/en.json`, replace:

```json
    "fullscreen": "Full screen",
    "noMateriYet": "No material is currently shown for the class.",
```

with:

```json
    "fullscreen": "Full screen",
    "autoHide": "Auto-hide bars",
    "noMateriYet": "No material is currently shown for the class.",
```

- [ ] **Step 2: Add the Indonesian string**

In `web/app/src/locales/id.json`, replace:

```json
    "fullscreen": "Layar penuh",
    "noMateriYet": "Belum ada materi yang ditampilkan untuk kelas.",
```

with:

```json
    "fullscreen": "Layar penuh",
    "autoHide": "Sembunyikan bilah otomatis",
    "noMateriYet": "Belum ada materi yang ditampilkan untuk kelas.",
```

- [ ] **Step 3: Verify both JSON files still parse**

```bash
node -e "JSON.parse(require('fs').readFileSync('web/app/src/locales/en.json','utf8')); JSON.parse(require('fs').readFileSync('web/app/src/locales/id.json','utf8')); console.log('json ok')"
```

Expected: prints `json ok` (no SyntaxError).

- [ ] **Step 4: Commit**

```bash
git add web/app/src/locales/en.json web/app/src/locales/id.json
git commit -m "i18n(live): add auto-hide bars string (en, id)"
```

---

## Task 2: Restructure the stage as a full-canvas with overlay chrome

Make the materi `<main>` a full-viewport canvas and turn the header/footer into absolutely-positioned overlays driven by a `chromeVisible` flag. In this task `chromeVisible` is a temporary constant `true` (no behavior change yet, bars stay visible) so the change is purely structural and independently verifiable.

**Files:**
- Modify: `web/app/src/pages/LiveSesi.tsx` (container, `<main>`, `<header>`, `<footer>`, and a new `chromeVisible` const)

- [ ] **Step 1: Introduce the temporary `chromeVisible` flag before the final `return`**

In `web/app/src/pages/LiveSesi.tsx`, the component computes `liveStatus` then has the loading/error early returns. Insert the flag right after the `liveStatus` block. Replace:

```tsx
  const liveStatus: 'pre' | 'live' | 'done' = !sesi
    ? 'pre'
    : sesi.endedAt
      ? 'done'
      : sesi.startedAt
        ? 'live'
        : 'pre'

  if (sesiQ.isLoading || !sesi) {
```

with:

```tsx
  const liveStatus: 'pre' | 'live' | 'done' = !sesi
    ? 'pre'
    : sesi.endedAt
      ? 'done'
      : sesi.startedAt
        ? 'live'
        : 'pre'

  // Replaced by the useAutoHideChrome hook in Task 4.
  const chromeVisible = true

  if (sesiQ.isLoading || !sesi) {
```

- [ ] **Step 2: Make the root container a positioning context (drop the flex column)**

Replace:

```tsx
    <div className="fixed inset-0 z-50 flex flex-col bg-neutral-950 text-neutral-100">
```

with:

```tsx
    <div className="fixed inset-0 z-50 bg-neutral-950 text-neutral-100">
```

- [ ] **Step 3: Convert the header to a top overlay**

Replace:

```tsx
      <header className="flex items-center gap-3 border-b border-neutral-800 bg-neutral-900/80 px-4 py-2.5 backdrop-blur">
```

with:

```tsx
      <header
        aria-hidden={!chromeVisible}
        className={`absolute inset-x-0 top-0 z-10 flex items-center gap-3 border-b border-neutral-800 bg-neutral-900/80 px-4 py-2.5 backdrop-blur transition-all duration-300 ease-out motion-reduce:transition-none ${
          chromeVisible ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0 pointer-events-none'
        }`}
      >
```

- [ ] **Step 4: Make the Stage `<main>` a full-viewport canvas**

Replace:

```tsx
      <main className="relative flex-1 overflow-hidden">
```

with:

```tsx
      <main className="absolute inset-0 overflow-hidden">
```

- [ ] **Step 5: Convert the footer to a bottom overlay**

Replace:

```tsx
      <footer className="flex flex-wrap items-center gap-2 border-t border-neutral-800 bg-neutral-900/80 px-3 py-2 backdrop-blur">
```

with:

```tsx
      <footer
        aria-hidden={!chromeVisible}
        className={`absolute inset-x-0 bottom-0 z-10 flex flex-wrap items-center gap-2 border-t border-neutral-800 bg-neutral-900/80 px-3 py-2 backdrop-blur transition-all duration-300 ease-out motion-reduce:transition-none ${
          chromeVisible ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none'
        }`}
      >
```

- [ ] **Step 6: Typecheck**

```bash
make typecheck
```

Expected: exits 0. (`chromeVisible` is used in three places, so no unused-local error.)

- [ ] **Step 7: Visual smoke test**

Rebuild the running app per the `CLAUDE.md` operator preference, from the worktree root:

```bash
docker-compose up -d --build
curl -fsS http://127.0.0.1:8300/healthz && echo " healthz ok"
podman logs --tail 20 gnrs
```

Then, following `CHROME_DEVTOOLS.md` (pre-flight: reuse the shared Chrome on `127.0.0.1:9222`, one tab) and `TEST.md`, open a live sesi with materi on the stage at `http://127.0.0.1:8300` and confirm: header and footer still render exactly as before, the materi area now spans the full height beneath them, and the Qur'an/Tilawati readers render correctly. Nothing should hide yet.

- [ ] **Step 8: Commit**

```bash
git add web/app/src/pages/LiveSesi.tsx
git commit -m "feat(live): make stage a full-canvas with overlay chrome"
```

---

## Task 3: Add the auto-hide preference (state, persistence, toggle button)

Add the persisted `autoHide` flag and a footer toggle. The chrome does not hide yet (`chromeVisible` is still the constant `true` from Task 2) — this task only wires the toggle + persistence so they can be verified on their own.

**Files:**
- Modify: `web/app/src/pages/LiveSesi.tsx` (lucide imports, `AUTO_HIDE_KEY` const, `autoHide` state + `toggleAutoHide`, toggle button in the footer)

- [ ] **Step 1: Import the two toggle icons**

Replace:

```tsx
import {
  CheckCircle2,
  ChevronLeft,
  EyeOff,
  LayoutPanelTop,
  Maximize2,
  Minimize2,
  Radio,
  Square,
  Type,
} from 'lucide-react'
```

with:

```tsx
import {
  CheckCircle2,
  ChevronLeft,
  EyeOff,
  LayoutPanelTop,
  Maximize2,
  Minimize2,
  PanelTopClose,
  PanelTopOpen,
  Radio,
  Square,
  Type,
} from 'lucide-react'
```

- [ ] **Step 2: Add the `localStorage` key constant**

After the `kindLabelKey` helper, replace:

```tsx
function kindLabelKey(k: DiajarkanKind) {
  return `live.kind.${k}` as const
}
```

with:

```tsx
function kindLabelKey(k: DiajarkanKind) {
  return `live.kind.${k}` as const
}

const AUTO_HIDE_KEY = 'gnrs.live.autoHideChrome'
```

- [ ] **Step 3: Add the `autoHide` state and toggle handler**

This goes in the hooks region, before the early returns. Replace:

```tsx
  const [historyOpen, setHistoryOpen] = useState(false)
```

with:

```tsx
  const [historyOpen, setHistoryOpen] = useState(false)

  // Per-operator viewing preference (not server-synced like liveDisplayMode):
  // when on, the stage chrome auto-hides while idle. Persisted in localStorage.
  const [autoHide, setAutoHide] = useState<boolean>(() => {
    try {
      return localStorage.getItem(AUTO_HIDE_KEY) === '1'
    } catch {
      return false
    }
  })
  const toggleAutoHide = () => {
    setAutoHide((v) => {
      const next = !v
      try {
        localStorage.setItem(AUTO_HIDE_KEY, next ? '1' : '0')
      } catch {
        /* ignore storage errors (private mode, disabled storage, etc.) */
      }
      return next
    })
  }
```

- [ ] **Step 4: Add the toggle button to the footer's right-hand cluster**

It sits just before the fullscreen button. Replace:

```tsx
          <button
            onClick={toggleFs}
            className="rounded-lg border border-neutral-700 p-1.5 text-neutral-300 hover:bg-neutral-800"
            aria-label={t('live.fullscreen')}
          >
            {isFs ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
```

with:

```tsx
          <button
            onClick={toggleAutoHide}
            aria-pressed={autoHide}
            aria-label={t('live.autoHide')}
            title={t('live.autoHide')}
            className={`rounded-lg border p-1.5 transition ${
              autoHide
                ? 'border-emerald-600/60 bg-emerald-500/20 text-emerald-300'
                : 'border-neutral-700 text-neutral-300 hover:bg-neutral-800'
            }`}
          >
            {autoHide ? <PanelTopClose size={14} /> : <PanelTopOpen size={14} />}
          </button>
          <button
            onClick={toggleFs}
            className="rounded-lg border border-neutral-700 p-1.5 text-neutral-300 hover:bg-neutral-800"
            aria-label={t('live.fullscreen')}
          >
            {isFs ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
```

- [ ] **Step 5: Typecheck**

```bash
make typecheck
```

Expected: exits 0.

- [ ] **Step 6: Verify the toggle + persistence in the browser**

Rebuild and open the live sesi as in Task 2 Step 7:

```bash
docker-compose up -d --build
curl -fsS http://127.0.0.1:8300/healthz && echo " healthz ok"
```

In Chrome DevTools (per `CHROME_DEVTOOLS.md`/`TEST.md`): the new toggle appears left of the fullscreen button. Click it → it shows the active emerald style and the icon switches to `PanelTopClose`; click again → back to neutral with `PanelTopOpen`. With it **on**, check DevTools → Application → Local Storage → `gnrs.live.autoHideChrome` is `"1"` (`"0"` when off). Reload the page → the toggle restores its last state. The chrome should **not** hide yet.

- [ ] **Step 7: Commit**

```bash
git add web/app/src/pages/LiveSesi.tsx
git commit -m "feat(live): add persisted auto-hide toggle"
```

---

## Task 4: Wire the idle auto-hide behavior

Add the `useAutoHideChrome` hook and replace the placeholder `chromeVisible` constant with its result. This completes the feature.

**Files:**
- Modify: `web/app/src/pages/LiveSesi.tsx` (`react` import, `HIDE_DELAY_MS` + hook, `chromeVisible` wiring)

- [ ] **Step 1: Import `useRef`**

Replace:

```tsx
import { useEffect, useState } from 'react'
```

with:

```tsx
import { useEffect, useRef, useState } from 'react'
```

- [ ] **Step 2: Add the delay constant and the hook**

After the `AUTO_HIDE_KEY` constant added in Task 3, replace:

```tsx
const AUTO_HIDE_KEY = 'gnrs.live.autoHideChrome'
```

with:

```tsx
const AUTO_HIDE_KEY = 'gnrs.live.autoHideChrome'
const HIDE_DELAY_MS = 3000

// Auto-hide the live-stage chrome (header + footer) after HIDE_DELAY_MS of no
// pointer/touch/key activity, so the materi fills the screen. Any activity
// reveals it and restarts the countdown. `suspended` forces the chrome visible
// and pauses the timer (e.g. while a dialog is open, or no materi is on stage).
function useAutoHideChrome({
  enabled,
  suspended,
}: {
  enabled: boolean
  suspended: boolean
}) {
  const [visible, setVisible] = useState(true)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    const clear = () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
    if (!enabled || suspended) {
      clear()
      setVisible(true)
      return
    }
    const arm = () => {
      clear()
      timerRef.current = window.setTimeout(() => setVisible(false), HIDE_DELAY_MS)
    }
    const reveal = () => {
      setVisible(true)
      arm()
    }
    setVisible(true)
    arm()
    const events: (keyof WindowEventMap)[] = ['mousemove', 'pointerdown', 'touchstart', 'keydown']
    events.forEach((e) => window.addEventListener(e, reveal, { passive: true }))
    return () => {
      events.forEach((e) => window.removeEventListener(e, reveal))
      clear()
    }
  }, [enabled, suspended])

  return visible
}
```

- [ ] **Step 3: Replace the placeholder `chromeVisible` with the hook**

Replace:

```tsx
  // Replaced by the useAutoHideChrome hook in Task 4.
  const chromeVisible = true
```

with:

```tsx
  const anyOverlayOpen = pickerOpen || endOpen || replaceConfirm || historyOpen
  const chromeVisible = useAutoHideChrome({
    enabled: autoHide,
    suspended: !current || anyOverlayOpen,
  })
```

Note: this `useAutoHideChrome` call sits with the other hooks, *above* the loading/error early returns, so the Rules of Hooks are preserved (the hook runs on every render).

- [ ] **Step 4: Typecheck**

```bash
make typecheck
```

Expected: exits 0.

- [ ] **Step 5: Full behavior verification in the browser**

Rebuild and open a live sesi with materi on the stage:

```bash
docker-compose up -d --build
curl -fsS http://127.0.0.1:8300/healthz && echo " healthz ok"
```

Walk the `TEST.md` flow in the shared Chrome and confirm each:

1. Enable the auto-hide toggle → after ~3 s both header and footer slide/fade away and the materi fills the screen.
2. Move the mouse (or tap) → both bars return instantly; after ~3 s idle they hide again.
3. While bars are visible, click "Pilih/Ganti Materi" to open the picker (and separately open History) → the bars stay visible the whole time the overlay is open; close it → idle hiding resumes.
4. With a sesi that has **no** materi on the stage yet → the chrome never hides regardless of the toggle (the "pick materi" controls stay reachable).
5. Turn the toggle **off** → the bars stay permanently visible (pre-feature behavior).
6. Reload the page → the toggle state is remembered (localStorage).
7. With a Qur'an mushaf and a Tilawati materi on stage, toggle the chrome hide/reveal a few times → the reader does **not** re-paginate or jump (the canvas size is constant).
8. (If feasible) In DevTools, emulate `prefers-reduced-motion: reduce` → the bars hide/show instantly with no slide/fade.

- [ ] **Step 6: Commit**

```bash
git add web/app/src/pages/LiveSesi.tsx
git commit -m "feat(live): auto-hide stage chrome after idle"
```

---

## Task 5: Final verification, PR, and cleanup

**Files:** none (process).

- [ ] **Step 1: Full typecheck + Go tests**

```bash
make typecheck
make test
```

Expected: both exit 0. (`make test` is Go-only and unaffected by this frontend change; running it confirms the worktree is green.)

- [ ] **Step 2: Confirm a clean, logical commit history**

```bash
git log --oneline gnrs-evan..HEAD
```

Expected (newest first): `feat(live): auto-hide stage chrome after idle`, `feat(live): add persisted auto-hide toggle`, `feat(live): make stage a full-canvas with overlay chrome`, `i18n(live): add auto-hide bars string (en, id)`, `docs(live): add auto-hide chrome design spec`.

- [ ] **Step 3: Push and open the PR against the track (`gnrs-evan`)**

Per `CLAUDE.md`/`RULES.md`, the PR targets `gnrs-evan` (never `main`). Only do this once Step 1 is green and the Task 4 Chrome DevTools pass had no errors.

```bash
git push -u origin feat/live-autohide
gh pr create --base gnrs-evan --head feat/live-autohide \
  --title "feat(live): auto-hide stage chrome after idle" \
  --body "$(cat <<'BODY'
Adds an opt-in auto-hide mode to the live session stage: after ~3s idle the
header and footer slide away so the materi fills the screen; any mouse/touch/key
activity reveals them. Off by default, remembered per-device in localStorage.
Frontend-only (LiveSesi.tsx + i18n); overlay layout keeps the Qur'an/Tilawati
readers from re-paginating. Spec + plan under docs/superpowers/.

## Tested via Chrome DevTools
- Idle hide after ~3s; reveal on mouse-move/tap; re-hide on idle.
- Bars stay visible while the materi picker / history / dialogs are open.
- No materi on stage ⇒ chrome stays visible.
- Toggle off ⇒ bars permanently visible (pre-feature behavior).
- Preference persists across reload (gnrs.live.autoHideChrome).
- Qur'an mushaf / Tilawati do not re-paginate when chrome toggles.
BODY
)"
```

- [ ] **Step 4: Merge once green, then clean up (per `CLAUDE.md`)**

After CI (if any) is green and the test pass has no errors, merge into the track and remove the branch:

```bash
gh pr merge --merge --delete-branch
```

Then tear down the worktree and refs from the main checkout (`/home/anchor/Podman/GNRS`):

```bash
git -C /home/anchor/Podman/GNRS worktree remove .claude/worktrees/live-autohide
git -C /home/anchor/Podman/GNRS branch -D feat/live-autohide
git -C /home/anchor/Podman/GNRS fetch --prune origin
```

(There is no per-agent `gnrs-dev-<slug>` container to remove here — verification reused the operator's main `gnrs` container per the operator preference.)

---

## Self-review

**Spec coverage:**
- Opt-in toggle in footer → Task 3. ✓
- Auto-hide both bars after idle, reveal on activity → Task 4 (`useAutoHideChrome`). ✓
- Overlay/full-canvas layout (no reader reflow) → Task 2; verified in Task 4 Step 5.7. ✓
- Suspend while overlays open / no materi → Task 4 Step 3 (`suspended`). ✓
- `prefers-reduced-motion` → `motion-reduce:transition-none` in Task 2 Steps 3 & 5; checked in Task 4 Step 5.8. ✓
- `aria-hidden`/`pointer-events-none` while hidden → Task 2 header/footer classes. ✓
- Persistence `gnrs.live.autoHideChrome` = `'1'`/`'0'`, default off → Task 3 Steps 2–3. ✓
- i18n `live.autoHide` (en + id) → Task 1. ✓
- 3000 ms delay → Task 4 `HIDE_DELAY_MS`. ✓
- Icons `PanelTopClose`/`PanelTopOpen` → Task 3 Step 1 (verified present in lucide-react 0.408). ✓
- Verification = typecheck + Chrome DevTools per TEST.md → Tasks 2–5. ✓

**Placeholder scan:** none — every code step shows the exact before/after; the only conditional instruction (`npm ci` vs `install`) is a concrete fallback, not a TBD.

**Type/name consistency:** `chromeVisible` (bool) introduced in Task 2, reused in Task 4; `autoHide`/`toggleAutoHide`/`AUTO_HIDE_KEY` consistent across Tasks 3–4; `useAutoHideChrome({ enabled, suspended })` signature matches its single call site; `useRef`/`useEffect`/`useState` imports all added where first used; hook placed above the early returns (Rules of Hooks). ✓
