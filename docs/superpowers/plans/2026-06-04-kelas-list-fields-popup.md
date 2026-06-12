# Kelas List Fields + Session Popup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Kelas List tab's dropdown + inline accordion with two always-visible, independently-scrollable searchable fields (My Class / Other Class) whose cards open a centered popup showing sessions grouped as In Progress / Upcoming / Missed / Done.

**Architecture:** Extract the session detail (buckets + rows + session sub-dialogs) out of the inline `KelasCard` accordion into a new `KelasSesiDialog` modal. Rewrite `KelasListSection` so each group renders through a reusable `KelasField` (own search box, sticky search bar, scrollable card grid). Slim `KelasCard` to a clickable tile with admin icons. No API/backend changes; filtering is client-side over the already-loaded `listKelas` result.

**Tech Stack:** React 18 + TypeScript, TanStack Query v5, react-i18next, Tailwind v3, lucide-react. No JS unit-test runner exists — the per-task gate is `tsc` (`npm --prefix web/app run typecheck`); behavior is verified via the Chrome DevTools flow in Task 5.

**Spec:** `docs/superpowers/specs/2026-06-04-kelas-list-fields-popup-design.md`

---

## File Structure

- **Create** `web/app/src/components/KelasSesiDialog.tsx` — the session popup. Owns the `Sesi` query for one kelas, the four-bucket grouping, per-session row actions, and the nested Reschedule / SesiForm / EndSesiSummary dialogs. Also the new home for the status helpers (`Status`, `STATUS_DOT`, `statusOf`, `localDate`, `pad2`).
- **Modify** `web/app/src/pages/sections/KelasListSection.tsx` — rewrite the exported section + `KelasCard`; add a `KelasField` component and a `matchKelas` helper; remove the dropdown (`showAll`), the inline accordion, and everything that moved into `KelasSesiDialog`. `KelasFormDialog`, `ageFromDob`, `matchTingkatForMurid`, and `FormValues` stay unchanged.
- **Modify** `web/app/src/locales/en.json` and `web/app/src/locales/id.json` — add `searchMyKelas`, `searchOtherKelas`, `noMatch` under `kelasSection.list`.

Order of work: i18n first (Task 1), then the new dialog (Task 2 — it has no dependency on the rewritten section), then the section rewrite that imports it (Task 3), then typecheck/commit (Task 4), then the browser test pass (Task 5).

---

## Task 1: Add i18n keys

**Files:**
- Modify: `web/app/src/locales/en.json:293`
- Modify: `web/app/src/locales/id.json:292`

- [ ] **Step 1: Add the three keys to en.json**

In `web/app/src/locales/en.json`, the `kelasSection.list` block has `"allKelas": "All classes",` at line 293. Insert three keys immediately after it:

```json
      "allKelas": "All classes",
      "searchMyKelas": "Search my classes…",
      "searchOtherKelas": "Search other classes…",
      "noMatch": "No classes match your search.",
```

- [ ] **Step 2: Add the three keys to id.json**

In `web/app/src/locales/id.json`, the `kelasSection.list` block has `"allKelas": "Semua kelas",` at line 292. Insert three keys immediately after it:

```json
      "allKelas": "Semua kelas",
      "searchMyKelas": "Cari kelas saya…",
      "searchOtherKelas": "Cari kelas lain…",
      "noMatch": "Tidak ada kelas yang cocok.",
```

- [ ] **Step 3: Verify both JSON files still parse**

Run: `node -e "require('./web/app/src/locales/en.json'); require('./web/app/src/locales/id.json'); console.log('json ok')"`
Expected: prints `json ok` (no SyntaxError).

- [ ] **Step 4: Commit**

```bash
git add web/app/src/locales/en.json web/app/src/locales/id.json
git commit -m "i18n(kelas): add field search + no-match keys"
```

---

## Task 2: Create the session popup `KelasSesiDialog`

**Files:**
- Create: `web/app/src/components/KelasSesiDialog.tsx`

This component is a near-verbatim lift of the current `KelasCard` expanded view (the sesi buckets, rows, and sub-dialogs) into a `Dialog`. The status helpers move here.

- [ ] **Step 1: Write the full component file**

Create `web/app/src/components/KelasSesiDialog.tsx` with exactly this content:

```tsx
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Pencil, Play, Plus, Radio, RotateCcw, Square, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'

import { type Kelas } from '@/api/kelas'
import { deleteSesi, listSesi, startSesi, type Sesi } from '@/api/sesi'
import { ApiError } from '@/api/client'
import { Button } from '@/components/Button'
import { Dialog } from '@/components/Dialog'
import { RescheduleSesiDialog } from '@/components/RescheduleSesiDialog'
import { EndSesiSummaryDialog } from '@/components/EndSesiSummaryDialog'
import { SesiFormDialog } from '@/components/SesiFormDialog'
import { cn } from '@/lib/cn'
import { useToast } from '@/lib/toast'
import { useConfirm } from '@/lib/confirm'

/**
 * KelasSesiDialog — modal showing one kelas's sessions grouped by status
 * (In Progress / Upcoming / Missed / Done). Lifted out of KelasListSection's
 * former inline accordion. Admin can add a sesi and act on each row; the
 * session sub-dialogs open layered above this one.
 */

export type Status = 'upcoming' | 'ongoing' | 'completed' | 'missed'

const STATUS_DOT: Record<Status, string> = {
  upcoming: 'bg-sky-500',
  ongoing: 'bg-amber-500',
  completed: 'bg-emerald-500',
  missed: 'bg-rose-500',
}

function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n)
}
function localDate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}
export function statusOf(s: Sesi, today: Date): Status {
  if (s.endedAt) return 'completed'
  if (s.startedAt) return 'ongoing'
  const iso = (s.tanggal || '').slice(0, 10)
  if (iso && iso < localDate(today)) return 'missed'
  return 'upcoming'
}

export function KelasSesiDialog({
  kelas: k,
  isAdmin,
  onClose,
}: {
  kelas: Kelas
  isAdmin: boolean
  onClose: () => void
}) {
  const today = useMemo(() => new Date(), [])
  const [rescheduling, setRescheduling] = useState<Sesi | null>(null)
  const [editingSesi, setEditingSesi] = useState<Sesi | null>(null)
  const [endingSesi, setEndingSesi] = useState<Sesi | null>(null)
  const [reviewingSesi, setReviewingSesi] = useState<Sesi | null>(null)
  const [addingSesi, setAddingSesi] = useState(false)
  const qc = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()
  const { t } = useTranslation()

  const STATUS_LABEL: Record<Status, string> = {
    upcoming: t('kelasSection.status.upcoming'),
    ongoing: t('kelasSection.status.ongoing'),
    completed: t('kelasSection.status.completed'),
    missed: t('kelasSection.status.missed'),
  }
  const invalidateSesi = () => {
    qc.invalidateQueries({ queryKey: ['kelas-sesi', k.id] })
    qc.invalidateQueries({ queryKey: ['sesi'] })
  }
  const startMut = useMutation({
    mutationFn: startSesi,
    onSuccess: () => {
      toast(t('kelasSection.list.sesiStarted'), 'success')
      invalidateSesi()
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : t('kelasSection.list.sesiStartFailed'), 'error'),
  })
  const delMut = useMutation({
    mutationFn: deleteSesi,
    onSuccess: () => {
      toast(t('kelasSection.list.sesiDeleted'), 'success')
      invalidateSesi()
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : t('kelasSection.list.sesiDeleteFailed'), 'error'),
  })

  const { data: sesiList = [], isLoading } = useQuery({
    queryKey: ['kelas-sesi', k.id],
    queryFn: () => listSesi({ kelasId: k.id }),
  })

  const buckets = useMemo(() => {
    const out: Record<Status, Sesi[]> = { ongoing: [], upcoming: [], completed: [], missed: [] }
    for (const s of sesiList) out[statusOf(s, today)].push(s)
    out.upcoming.sort((a, b) => a.tanggal.localeCompare(b.tanggal))
    out.completed.sort((a, b) => b.tanggal.localeCompare(a.tanggal))
    out.missed.sort((a, b) => b.tanggal.localeCompare(a.tanggal))
    return out
  }, [sesiList, today])

  const totalSesi = sesiList.length
  const subtitle = k.guruName
    ? t('kelasSection.list.cardSubtitleWithWali', { tingkat: k.tingkat, tahun: k.tahun, wali: k.guruName })
    : t('kelasSection.list.cardSubtitle', { tingkat: k.tingkat, tahun: k.tahun })

  return (
    <Dialog title={k.nama} onClose={onClose} size="lg">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="truncate text-sm text-slate-500">{subtitle}</p>
        {isAdmin ? (
          <Button size="sm" onClick={() => setAddingSesi(true)}>
            <Plus size={14} className="mr-1" /> {t('kelasSection.list.addSesi')}
          </Button>
        ) : null}
      </div>

      {isLoading ? (
        <p className="py-8 text-center text-sm text-slate-500">{t('kelasSection.list.loadingSesi')}</p>
      ) : totalSesi === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">{t('kelasSection.list.noSesi')}</p>
      ) : (
        <div className="space-y-3">
          {(['ongoing', 'upcoming', 'missed', 'completed'] as Status[]).map((st) =>
            buckets[st].length > 0 ? (
              <div key={st}>
                <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <span className={cn('inline-block h-2 w-2 rounded-full', STATUS_DOT[st])} />
                  {STATUS_LABEL[st]}
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] text-slate-700">
                    {buckets[st].length}
                  </span>
                </div>
                <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
                  {buckets[st].map((s) => {
                    const canResched = isAdmin && !s.endedAt && (st === 'upcoming' || st === 'missed' || st === 'ongoing')
                    return (
                      <li key={s.id} className="flex items-center gap-1.5 px-3 py-2">
                        {s.endedAt ? (
                          <button
                            type="button"
                            onClick={() => setReviewingSesi(s)}
                            className="min-w-0 flex-1 cursor-pointer text-left transition hover:opacity-75"
                            title={t('kelasSection.list.reviewSummary')}
                          >
                            <div className="text-sm font-medium text-slate-900 underline decoration-dotted underline-offset-2">
                              {s.topik}
                            </div>
                            <div className="text-xs text-slate-500">
                              {s.tanggal}
                              {s.mulai ? ` · ${s.mulai}${s.selesai ? `–${s.selesai}` : ''}` : ''}
                            </div>
                          </button>
                        ) : (
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-slate-900">{s.topik}</div>
                            <div className="text-xs text-slate-500">
                              {s.tanggal}
                              {s.mulai ? ` · ${s.mulai}${s.selesai ? `–${s.selesai}` : ''}` : ''}
                            </div>
                          </div>
                        )}
                        {isAdmin ? (
                          <>
                            {!s.startedAt ? (
                              <button
                                type="button"
                                onClick={() => startMut.mutate(s.id)}
                                disabled={startMut.isPending}
                                className="rounded-md p-1.5 text-slate-400 transition hover:bg-amber-50 hover:text-amber-700 disabled:opacity-50"
                                aria-label={t('kelasSection.list.startSesi')}
                                title={t('kelasSection.list.startSesi')}
                              >
                                <Play size={14} />
                              </button>
                            ) : !s.endedAt ? (
                              <>
                                <Link
                                  to={`/kelas/${s.kelasId ?? k.id}/sesi/${s.id}/live`}
                                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                                  aria-label={t('kelasSection.list.liveStage')}
                                  title={t('kelasSection.list.openLive')}
                                >
                                  <span className="relative flex h-2 w-2">
                                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                                    <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                                  </span>
                                  <Radio size={13} />
                                  Live
                                </Link>
                                <button
                                  type="button"
                                  onClick={() => setEndingSesi(s)}
                                  className="rounded-md p-1.5 text-slate-400 transition hover:bg-emerald-50 hover:text-emerald-700"
                                  aria-label={t('kelasSection.list.endSesi')}
                                  title={t('kelasSection.list.endSesi')}
                                >
                                  <Square size={14} />
                                </button>
                              </>
                            ) : null}
                            {canResched ? (
                              <button
                                type="button"
                                onClick={() => setRescheduling(s)}
                                className="rounded-md p-1.5 text-slate-400 transition hover:bg-sky-50 hover:text-sky-700"
                                aria-label={t('kelasSection.list.reschedule')}
                                title={t('kelasSection.list.reschedule')}
                              >
                                <RotateCcw size={14} />
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => setEditingSesi(s)}
                              className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-900"
                              aria-label={t('common.edit')}
                              title={t('common.edit')}
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                if (await confirm({ message: t('kelasSection.list.confirmDeleteSesi', { topik: s.topik }), danger: true })) delMut.mutate(s.id)
                              }}
                              disabled={delMut.isPending}
                              className="rounded-md p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                              aria-label={t('common.delete')}
                              title={t('common.delete')}
                            >
                              <Trash2 size={14} />
                            </button>
                          </>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              </div>
            ) : null,
          )}
        </div>
      )}

      {rescheduling ? (
        <RescheduleSesiDialog
          sesi={rescheduling}
          tingkat={k.tingkat}
          onClose={() => setRescheduling(null)}
          onSaved={() => {
            invalidateSesi()
            setRescheduling(null)
          }}
        />
      ) : null}

      {addingSesi ? (
        <SesiFormDialog
          mode="create"
          defaults={{ kelasId: k.id, defaultTingkat: k.tingkat }}
          onClose={() => setAddingSesi(false)}
          onSaved={() => {
            invalidateSesi()
            setAddingSesi(false)
          }}
        />
      ) : null}

      {editingSesi ? (
        <SesiFormDialog
          mode="edit"
          sesi={editingSesi}
          onClose={() => setEditingSesi(null)}
          onSaved={() => {
            invalidateSesi()
            setEditingSesi(null)
          }}
        />
      ) : null}

      {endingSesi ? (
        <EndSesiSummaryDialog
          sesi={endingSesi}
          onClose={() => setEndingSesi(null)}
          onEnded={() => {
            invalidateSesi()
            setEndingSesi(null)
          }}
        />
      ) : null}

      {reviewingSesi ? (
        <EndSesiSummaryDialog
          sesi={reviewingSesi}
          onClose={() => setReviewingSesi(null)}
          onEnded={() => {
            invalidateSesi()
            setReviewingSesi(null)
          }}
        />
      ) : null}
    </Dialog>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npm --prefix web/app run typecheck`
Expected: PASS (exit 0). Note: `KelasSesiDialog` is not imported anywhere yet — that wiring happens in Task 3. An "unused export" does not fail `tsc`, so this should be clean. If `tsc` reports an unused *import* inside the file, remove it.

- [ ] **Step 3: Commit**

```bash
git add web/app/src/components/KelasSesiDialog.tsx
git commit -m "feat(kelas): add KelasSesiDialog session popup"
```

---

## Task 3: Rewrite `KelasListSection` — fields + tile + popup wiring

**Files:**
- Modify: `web/app/src/pages/sections/KelasListSection.tsx` (replace lines 1–570: imports, the `Status`/`STATUS_DOT`/`statusOf`/`localDate`/`pad2` helpers, the exported `KelasListSection`, and the `KelasCard` accordion. Keep lines 572–893 unchanged: the `// ----` separator, `FormValues`, `ageFromDob`, `matchTingkatForMurid`, and `KelasFormDialog`.)

- [ ] **Step 1: Replace the top of the file (imports through end of `KelasCard`)**

Open `web/app/src/pages/sections/KelasListSection.tsx`. Replace everything **from line 1 through the end of the `KelasCard` function and its trailing separator comment** (i.e. up to and including the `// -----...` line that precedes `type FormValues`) with the block below. Do **not** touch `FormValues`, `ageFromDob`, `matchTingkatForMurid`, or `KelasFormDialog` further down — they stay exactly as they are.

```tsx
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { Pencil, Plus, Trash2, Users } from 'lucide-react'

import {
  addAnggota,
  createKelas,
  deleteKelas,
  listKelas,
  updateKelas,
  type Kelas,
  type KelasInput,
} from '@/api/kelas'
import { listTingkat } from '@/api/kurikulum'
import { listStudents } from '@/api/students'
import { listUsers } from '@/api/users'
import { ApiError } from '@/api/client'
import { Button } from '@/components/Button'
import { Dialog } from '@/components/Dialog'
import { Field } from '@/components/Field'
import { Input } from '@/components/Input'
import { KelasAnggotaDialog } from '@/components/KelasAnggotaDialog'
import { KelasSesiDialog } from '@/components/KelasSesiDialog'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/cn'
import { useToast } from '@/lib/toast'
import { useConfirm } from '@/lib/confirm'

/**
 * KelasListSection — two always-visible searchable fields (My Class / Other
 * Class). Each field has its own search box, a sticky search bar, and a
 * scrollable card grid. Clicking a card opens KelasSesiDialog (the session
 * popup). Admins CRUD kelas via dialogs reached from the card icons / top bar.
 */

function matchKelas(k: Kelas, q: string): boolean {
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  return (
    k.nama.toLowerCase().includes(needle) ||
    (k.guruName ?? '').toLowerCase().includes(needle) ||
    k.tingkat.toLowerCase().includes(needle)
  )
}

export function KelasListSection() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const toast = useToast()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const { t } = useTranslation()
  const [dialog, setDialog] = useState<
    | { kind: 'create' }
    | { kind: 'edit'; kelas: Kelas }
    | { kind: 'anggota'; kelas: Kelas }
    | null
  >(null)
  const [selected, setSelected] = useState<Kelas | null>(null)

  const { data: list = [], isPending } = useQuery({
    queryKey: ['kelas'],
    queryFn: () => listKelas({}),
  })

  // Split into "kelas saya" (current user is one of the guru) and the rest.
  const isMine = (k: Kelas) => Boolean(user?.id) && (k.guruUserIds ?? []).includes(user!.id)
  const myKelas = useMemo(() => list.filter(isMine), [list, user?.id])
  const otherKelas = useMemo(() => list.filter((k) => !isMine(k)), [list, user?.id])
  const bothFields = myKelas.length > 0 && otherKelas.length > 0

  const deleteMut = useMutation({
    mutationFn: deleteKelas,
    onSuccess: () => {
      toast(t('kelasSection.list.kelasDeleted'), 'success')
      qc.invalidateQueries({ queryKey: ['kelas'] })
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : t('kelasSection.list.kelasDeleteFailed'), 'error'),
  })

  const handleDelete = async (k: Kelas) => {
    if (await confirm({ message: t('kelasSection.list.confirmDelete', { nama: k.nama }), danger: true })) {
      deleteMut.mutate(k.id)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col px-4 pb-4 pt-4 md:px-6">
      <div className="mb-3 flex flex-shrink-0 items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          {isPending ? t('common.loading') : t('kelasSection.list.countRegistered', { count: list.length })}
        </p>
        {isAdmin ? (
          <Button size="sm" onClick={() => setDialog({ kind: 'create' })}>
            <Plus size={16} className="mr-1" /> {t('kelasSection.list.addKelas')}
          </Button>
        ) : null}
      </div>

      {!isPending && list.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <p className="text-base font-semibold text-slate-700">{t('kelasSection.list.emptyTitle')}</p>
          <p className="mt-1 text-sm text-slate-500">
            {isAdmin ? t('kelasSection.list.emptyHintAdmin') : t('kelasSection.list.emptyHintUser')}
          </p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          {myKelas.length > 0 ? (
            <KelasField
              label={t('kelasSection.list.myKelas')}
              searchPlaceholder={t('kelasSection.list.searchMyKelas')}
              kelasList={myKelas}
              isAdmin={isAdmin}
              onOpen={setSelected}
              onEdit={(k) => setDialog({ kind: 'edit', kelas: k })}
              onDelete={handleDelete}
              onAnggota={(k) => setDialog({ kind: 'anggota', kelas: k })}
              className={bothFields ? 'max-h-[45%] flex-none' : 'flex-1'}
            />
          ) : null}

          {otherKelas.length > 0 ? (
            <KelasField
              label={t('kelasSection.list.allKelas')}
              searchPlaceholder={t('kelasSection.list.searchOtherKelas')}
              kelasList={otherKelas}
              isAdmin={isAdmin}
              onOpen={setSelected}
              onEdit={(k) => setDialog({ kind: 'edit', kelas: k })}
              onDelete={handleDelete}
              onAnggota={(k) => setDialog({ kind: 'anggota', kelas: k })}
              className="flex-1"
            />
          ) : null}
        </div>
      )}

      {selected ? (
        <KelasSesiDialog kelas={selected} isAdmin={isAdmin} onClose={() => setSelected(null)} />
      ) : null}

      {dialog?.kind === 'create' ? (
        <KelasFormDialog onClose={() => setDialog(null)} onSaved={() => setDialog(null)} />
      ) : null}
      {dialog?.kind === 'edit' ? (
        <KelasFormDialog
          kelas={dialog.kelas}
          onClose={() => setDialog(null)}
          onSaved={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === 'anggota' ? (
        <KelasAnggotaDialog
          kelasId={dialog.kelas.id}
          kelasNama={dialog.kelas.nama}
          tingkat={dialog.kelas.tingkat}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </div>
  )
}

// -----------------------------------------------------------------------

function KelasField({
  label,
  searchPlaceholder,
  kelasList,
  isAdmin,
  onOpen,
  onEdit,
  onDelete,
  onAnggota,
  className,
}: {
  label: string
  searchPlaceholder: string
  kelasList: Kelas[]
  isAdmin: boolean
  onOpen: (k: Kelas) => void
  onEdit: (k: Kelas) => void
  onDelete: (k: Kelas) => void
  onAnggota: (k: Kelas) => void
  className?: string
}) {
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  const filtered = useMemo(() => kelasList.filter((k) => matchKelas(k, q)), [kelasList, q])

  return (
    <section className={cn('flex min-h-0 flex-col', className)}>
      <div className="mb-1 flex flex-shrink-0 items-center gap-2 px-0.5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</h3>
        <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-700">
          {kelasList.length}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 bg-slate-50 pb-2">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
          />
        </div>
        {filtered.length === 0 ? (
          <p className="px-1 py-6 text-center text-sm text-slate-500">{t('kelasSection.list.noMatch')}</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((k) => (
              <KelasCard
                key={k.id}
                kelas={k}
                isAdmin={isAdmin}
                onOpen={() => onOpen(k)}
                onEdit={() => onEdit(k)}
                onDelete={() => onDelete(k)}
                onAnggota={() => onAnggota(k)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

// -----------------------------------------------------------------------

function KelasCard({
  kelas: k,
  isAdmin,
  onOpen,
  onEdit,
  onDelete,
  onAnggota,
}: {
  kelas: Kelas
  isAdmin: boolean
  onOpen: () => void
  onEdit: () => void
  onDelete: () => void
  onAnggota: () => void
}) {
  const { t } = useTranslation()
  const subtitle = k.guruName
    ? t('kelasSection.list.cardSubtitleWithWali', { tingkat: k.tingkat, tahun: k.tahun, wali: k.guruName })
    : t('kelasSection.list.cardSubtitle', { tingkat: k.tingkat, tahun: k.tahun })

  return (
    <div className="relative rounded-lg border border-slate-200 bg-white shadow-sm transition hover:border-sky-300 hover:shadow">
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          'flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400',
          isAdmin && 'pr-24',
        )}
      >
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-sky-50 text-lg">
          🏫
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-semibold text-slate-900">{k.nama}</div>
          <div className="truncate text-xs text-slate-500">{subtitle}</div>
        </div>
      </button>
      {isAdmin ? (
        <div className="absolute right-2 top-2 flex items-center gap-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onAnggota()
            }}
            className="rounded-md bg-white/80 p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            aria-label={t('kelasSection.list.manageAnggota')}
            title={t('kelasSection.list.manageAnggota')}
          >
            <Users size={16} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onEdit()
            }}
            className="rounded-md bg-white/80 p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            aria-label={t('kelasSection.list.editKelas')}
            title={t('kelasSection.list.editKelas')}
          >
            <Pencil size={16} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
            className="rounded-md bg-white/80 p-1.5 text-slate-500 transition hover:bg-rose-50 hover:text-rose-600"
            aria-label={t('kelasSection.list.deleteKelas')}
            title={t('kelasSection.list.deleteKelas')}
          >
            <Trash2 size={16} />
          </button>
        </div>
      ) : null}
    </div>
  )
}

// -----------------------------------------------------------------------
```

- [ ] **Step 2: Confirm the lower half of the file is intact and unused imports are gone**

Run: `grep -n "PageShell\|listSesi\|ChevronDown\|RescheduleSesiDialog\|function KelasFormDialog" web/app/src/pages/sections/KelasListSection.tsx`
Expected: only `function KelasFormDialog` matches. `PageShell`, `listSesi`, `ChevronDown`, and `RescheduleSesiDialog` must **not** appear (they moved or were removed). If any still appears in an import line, delete that import.

- [ ] **Step 3: Typecheck**

Run: `npm --prefix web/app run typecheck`
Expected: PASS (exit 0). Common failures and fixes:
- "`PageShell` is declared but never read" → its import line was left behind; delete it.
- "`'X' is declared but its value is never read'`" for any removed icon (`Play`, `Radio`, `Square`, `RotateCcw`, `ChevronDown`, `ChevronRight`) → delete it from the lucide-react import.
- "Cannot find module '@/components/KelasSesiDialog'" → Task 2 was not completed/saved.

- [ ] **Step 4: Commit**

```bash
git add web/app/src/pages/sections/KelasListSection.tsx
git commit -m "feat(kelas): two searchable fields, card tiles open popup"
```

---

## Task 4: Full build + lint gate

**Files:** none (verification only)

- [ ] **Step 1: Typecheck the whole frontend**

Run: `npm --prefix web/app run typecheck`
Expected: PASS (exit 0).

- [ ] **Step 2: Production build (catches anything tsc -b skips)**

Run: `npm --prefix web/app run build`
Expected: Vite build completes, emits `web/app/dist/assets/index-*.js`, exit 0.

- [ ] **Step 3: Go tests (sanity — backend untouched, must still pass)**

Run: `make test`
Expected: PASS. (No Go files changed; this guards against an unrelated break.)

- [ ] **Step 4: Commit only if Steps 1–3 surfaced a fix**

If a fix was needed, commit it:

```bash
git add -A
git commit -m "fix(kelas): resolve build/typecheck issues"
```

If nothing changed, skip this commit.

---

## Task 5: Browser verification (Chrome DevTools / TEST.md)

**Files:** none (manual verification; required before PR per CLAUDE.md + TEST.md)

- [ ] **Step 1: Rebuild the running app (operator preference — single `gnrs` container)**

Run from the worktree root:

```bash
docker-compose up -d --build
```

Then smoke-test:

```bash
curl -fsS http://127.0.0.1:8300/healthz && echo OK
podman logs --tail 20 gnrs
```

Expected: `healthz` returns OK; logs show the server listening with no startup errors.

- [ ] **Step 2: Read CHROME_DEVTOOLS.md pre-flight, then drive the List tab**

Follow `CHROME_DEVTOOLS.md` (shared headless Chrome on `127.0.0.1:9222`, one tab for this task). Log in, navigate to **Kelas → List**, and verify against the spec's Testing section:
- Both fields render (My Class capped, Other Class fills) and **each scrolls independently**; the search bar stays **pinned** while cards scroll.
- Typing in the My Class search filters **only** My Class cards; the Other Class search filters only Other Class; the no-match string appears for a query with no results.
- Clicking a card body opens the **centered popup**; the four buckets (In Progress / Upcoming / Missed / Done) render with correct counts and ordering.
- The card's admin icons (members / edit / delete) work and do **NOT** open the popup.
- Inside the popup: **Add Sesi**, then per-session **start → Live → end**, **reschedule**, **edit**, **delete**, and **review** (click an ended session) all work and the list refreshes.
- Narrow the viewport to mobile width: fields stack, grid collapses to one column, popup remains usable.

- [ ] **Step 3: Capture evidence for the PR**

Take screenshots of: (a) the two-field List view, (b) a search filtering results, (c) the open session popup with buckets. Save the paths for the PR's "Tested via Chrome DevTools" section.

- [ ] **Step 4: Open the PR against `gnrs-evan`**

```bash
git push -u origin feat/kelas-fields
gh pr create --base gnrs-evan --head feat/kelas-fields \
  --title "feat(kelas): searchable My/Other fields + session popup" \
  --body "<summary + Tested via Chrome DevTools section with screenshots>"
```

Then auto-merge once green per CLAUDE.md (`gh pr merge <num> --merge --delete-branch`), and run the worktree/branch/container cleanup checklist.

---

## Self-Review

**1. Spec coverage:**
- Two always-visible fields, no dropdown → Task 3 (`KelasField` ×2; `showAll` removed). ✓
- Bounded, independently-scrollable with sticky search → Task 3 (`min-h-0 flex-1 overflow-y-auto` + `sticky top-0 bg-slate-50`). ✓
- Per-field search (name + guru + tingkat) → Task 3 (`matchKelas`, per-field `q` state). ✓
- Card click → centered popup with In Progress / Upcoming / Missed / Done → Task 2 (`KelasSesiDialog`, four ordered buckets). ✓
- Kelas admin icons on card, session actions in popup → Task 3 (card icons w/ stopPropagation) + Task 2 (Add Sesi + row actions). ✓
- No per-card count (avoid N queries) → Task 3 (tile shows subtitle only). ✓
- i18n keys → Task 1. ✓
- Height split (My capped 45% when both present) → Task 3 (`bothFields` className). ✓
- Helpers move to dialog → Task 2; lower half of section file untouched → Task 3 Step 2 guard. ✓
- Testing (typecheck/build/go + Chrome DevTools + PR to gnrs-evan) → Tasks 4–5. ✓

**2. Placeholder scan:** No TBD/TODO; every code step is complete and copy-pasteable; the JSON edits show exact surrounding lines. ✓

**3. Type consistency:**
- `KelasSesiDialog` props `{ kelas: Kelas; isAdmin: boolean; onClose: () => void }` — defined in Task 2, called identically in Task 3. ✓
- `KelasField`/`KelasCard` callback props (`onOpen`/`onEdit`/`onDelete`/`onAnggota`) — `KelasField` receives `(k: Kelas) => void` from the section and passes `() => void` (pre-bound) to `KelasCard`; `KelasCard` declares them as `() => void`. Consistent. ✓
- `listSesi({ kelasId: k.id })` matches `SesiListParams.kelasId?: string`; `as any` dropped. ✓
- `statusOf`/`buckets`/`STATUS_DOT`/`Status` all defined and used within `KelasSesiDialog`. ✓
- Reused i18n keys (`cardSubtitle`, `cardSubtitleWithWali`, `kelasSection.status.*`, all `kelasSection.list.*` action keys) exist today. New keys added in Task 1. ✓
