import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Check, ChevronDown, ChevronRight, Minus, Search, X } from 'lucide-react'

import {
  listLibraryPencapaian,
  listPencapaian,
  upsertPencapaian,
  type PencapaianRow,
  type PencapaianStatus,
} from '@/api/pencapaian'
import { LibraryRefLabel } from '@/components/LibraryRefLabel'
import { listBacaan } from '@/api/bacaan'
import { listDoa } from '@/api/doa'
import { listKitab } from '@/api/hadits'
import { listTingkat, type MateriAjar } from '@/api/kurikulum'
import { listQuranSurahs } from '@/api/quran'
import { listStudents } from '@/api/students'
import { ageInYears } from '@/lib/age'
import { ApiError } from '@/api/client'
import {
  TILAWATI_LEARNING_PAGES_BY_JILID,
  TILAWATI_LEARNING_START,
  TILAWATI_TOTAL_LEARNING_PAGES,
} from '@/lib/tilawati'
import { Field } from '@/components/Field'
import { Input } from '@/components/Input'
import { PageShell, PageHeader } from '@/components/PageShell'
import { useAuth } from '@/lib/auth'
import { useToast } from '@/lib/toast'
import { cn } from '@/lib/cn'

/**
 * Pencapaian — per-murid mastery tracker, ported from sitrac-v3.
 * Same hierarchical tree as Settings → Kurikulum (tema → sub-tema →
 * kelompok → materi) with a progress bar aligned at each level.
 *
 * Filter: pick a murid + optional umur range (kurikulum is age-graded,
 * so umur from-to lets you check progress across a developmental window).
 */

const TEMA_ORDER = ['ALIM', 'FAQIH', 'AKHLAQUL KARIMAH', 'KEMANDIRIAN']
const TEMA_LABEL: Record<string, string> = {
  ALIM: '🕌 Alim',
  FAQIH: '📚 Faqih',
  'AKHLAQUL KARIMAH': '✨ Akhlaqul Karimah',
  KEMANDIRIAN: '🎯 Kemandirian',
}
const TEMA_COLOR: Record<string, string> = {
  ALIM: '#5b6f4e',
  FAQIH: '#b88a3a',
  'AKHLAQUL KARIMAH': '#8a5cd6',
  KEMANDIRIAN: '#3a8a8a',
}

const STATUS_CYCLE: PencapaianStatus[] = ['belum', 'proses', 'tuntas']

export function AchievementPage() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<'kurikulum' | 'library'>('kurikulum')
  return (
    <PageShell
      header={
        <PageHeader
          title={t('achievement.title')}
          subtitle={t('achievement.subtitle')}
        />
      }
    >
      <div className="mb-4 flex border-b border-slate-200">
        <TabButton active={tab === 'kurikulum'} onClick={() => setTab('kurikulum')}>
          {t('achievement.tabKurikulum')}
        </TabButton>
        <TabButton active={tab === 'library'} onClick={() => setTab('library')}>
          {t('achievement.tabLibrary')}
        </TabButton>
      </div>
      {tab === 'kurikulum' ? <KurikulumTab /> : <LibraryTab />}
    </PageShell>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        '-mb-px px-4 py-2 text-sm font-medium transition border-b-2',
        active
          ? 'border-slate-900 text-slate-900'
          : 'border-transparent text-slate-500 hover:text-slate-700',
      )}
    >
      {children}
    </button>
  )
}

function KurikulumTab() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const isMurid = user?.role === 'murid'
  const canEdit = user?.role === 'admin' || user?.role === 'pengurus' || user?.role === 'guru'

  const [muridUserId, setMuridUserId] = useState<string>(isMurid ? user!.id : '')
  // (umur, semester) pair as the filter unit. `fromKey` and `toKey` are
  // strings like "5-1" (5 tahun, semester 1).
  const [fromKey, setFromKey] = useState<string>('')
  const [toKey, setToKey] = useState<string>('')
  // Track which murid id we last auto-defaulted for — so picking a new
  // murid resets the filter to their umur, but manual edits afterwards
  // aren't clobbered on re-renders.
  const autoDefaultedFor = useRef<string>('')

  const { data: students } = useQuery({
    queryKey: ['students', { all: true }],
    queryFn: () => listStudents({ status: 'active', limit: 500 }),
    enabled: !isMurid,
    staleTime: 60_000,
  })

  const { data: tingkatList = [] } = useQuery({
    queryKey: ['tingkat'],
    queryFn: listTingkat,
    staleTime: 5 * 60_000,
  })

  // Build (umur, semester) options from tingkat. Each tingkat with umur
  // produces two options (sem 1 + sem 2). Sorted by umur ascending then
  // semester. Label looks like "5 th · Sem 1 · TK-A".
  const umurSemOptions = useMemo(() => {
    type Opt = { key: string; umur: number; sem: 1 | 2; label: string; tingkat: string }
    const opts: Opt[] = []
    for (const ting of tingkatList) {
      if (typeof ting.umur !== 'number') continue
      for (const sem of [1, 2] as const) {
        opts.push({
          key: `${ting.umur}-${sem}`,
          umur: ting.umur,
          sem,
          tingkat: ting.nama,
          label: t('achievement.umurSemLabel', { umur: ting.umur, sem, tingkat: ting.nama }),
        })
      }
    }
    opts.sort((a, b) => (a.umur - b.umur) || (a.sem - b.sem) || a.tingkat.localeCompare(b.tingkat))
    return opts
  }, [tingkatList, t])

  // Parse the (umur, sem) tuple from a key string.
  const parseKey = (k: string): { umur: number; sem: 1 | 2 } | null => {
    const m = k.match(/^(\d+)-([12])$/)
    if (!m) return null
    return { umur: Number(m[1]), sem: Number(m[2]) as 1 | 2 }
  }

  const fromParsed = parseKey(fromKey)
  const toParsed = parseKey(toKey)

  // Auto-set "Umur dari" + "Umur sampai" when a murid is freshly picked.
  // Default to (murid's age, current semester) — 1-semester window.
  // Semester: bulan Juli (idx 6) sampai Desember = Sem 1; Jan–Jun = Sem 2.
  // Fallback chain: dateOfBirth → level→tingkat.umur → first available umur.
  useEffect(() => {
    if (!muridUserId) return
    if (autoDefaultedFor.current === muridUserId) return
    // Need both queries resolved to make a decision.
    if (!students || tingkatList.length === 0) return
    const murid = students.items.find((s) => s.id === muridUserId)
    if (!murid) return
    let age: number | null = null
    if (murid.dateOfBirth) {
      age = ageInYears(murid.dateOfBirth)
    }
    if (age == null && murid.level) {
      // Match the murid's level (e.g. "sd-1") to a tingkat name and pull
      // its umur. The tingkat seed uses uppercase names like "SD-1" or
      // "PAUD (TK)" — compare case-insensitively against the level slug.
      const slug = murid.level.toLowerCase()
      const t = tingkatList.find(
        (t) =>
          t.nama.toLowerCase().includes(slug) ||
          slug.includes(t.nama.toLowerCase().replace(/[^a-z0-9-]/g, '')),
      )
      if (t?.umur != null) age = t.umur
    }
    if (age == null && umurSemOptions.length > 0) {
      // Last-resort: pick the earliest tingkat with a known umur.
      age = umurSemOptions[0].umur
    }
    if (age == null) return
    // Cap at curriculum max (18 th). When the murid is older, snap to
    // "18 th · Sem 2" — the last semester window in the syllabus.
    let sem: 1 | 2 = new Date().getMonth() >= 6 ? 1 : 2
    if (age > 18) {
      age = 18
      sem = 2
    }
    const key = `${age}-${sem}`
    setFromKey(key)
    setToKey(key)
    autoDefaultedFor.current = muridUserId
  }, [muridUserId, students, tingkatList, umurSemOptions])

  const { data: rows = [], isPending } = useQuery({
    queryKey: ['pencapaian', muridUserId, fromKey, toKey],
    queryFn: () =>
      listPencapaian({
        muridUserId,
        fromUmur: fromParsed?.umur,
        fromSem: fromParsed?.sem,
        toUmur: toParsed?.umur,
        toSem: toParsed?.sem,
      }),
    enabled: Boolean(muridUserId),
  })

  return (
    <div className="space-y-4">
        {/* Filter card */}
        <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <div className="space-y-3">
            <Field label={t('achievement.muridLabel')} htmlFor="p-murid">
              {isMurid ? (
                <div className="flex h-10 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm">
                  {user?.name}
                </div>
              ) : (
                <MuridPicker
                  students={students?.items ?? []}
                  value={muridUserId}
                  onChange={setMuridUserId}
                />
              )}
            </Field>
            {/* Umur dari + Umur sampai — mobile 2-col, desktop 2-col too.
                Default to 1-semester window: picking "Umur dari" auto-fills
                "Umur sampai" with the same key. User can broaden the range
                by changing "Umur sampai" independently. */}
            <div className="grid grid-cols-2 gap-2">
              <Field label={t('achievement.fromLabel')} htmlFor="p-from-key">
                <UmurSemCombo
                  id="p-from-key"
                  options={umurSemOptions}
                  value={fromKey}
                  onChange={(v) => {
                    setFromKey(v)
                    // Auto-mirror to "Umur sampai" unless user has
                    // explicitly widened the range past the new fromKey.
                    if (!toKey || toKey === fromKey) setToKey(v)
                    else {
                      const a = parseKey(v)
                      const b = parseKey(toKey)
                      if (a && b && (b.umur < a.umur || (b.umur === a.umur && b.sem < a.sem))) {
                        setToKey(v)
                      }
                    }
                  }}
                  placeholder={t('achievement.fromPh')}
                />
              </Field>
              <Field label={t('achievement.toLabel')} htmlFor="p-to-key">
                <UmurSemCombo
                  id="p-to-key"
                  options={umurSemOptions}
                  value={toKey}
                  onChange={setToKey}
                  placeholder={fromKey || t('achievement.toPh')}
                />
              </Field>
            </div>
          </div>
        </div>

        {!muridUserId ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center text-sm text-slate-500">
            {t('achievement.pickMuridFirst')}
          </div>
        ) : isPending ? (
          <div className="rounded-lg border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500">
            {t('achievement.loading')}
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center text-sm text-slate-500">
            {t('achievement.emptyFilter')}
          </div>
        ) : (
          <PencapaianTree rows={rows} canEdit={canEdit} muridUserId={muridUserId} />
        )}
    </div>
  )
}

// ---------------------------------------------------------------------------

function MuridPicker({
  students,
  value,
  onChange,
}: {
  students: { id: string; name: string; nickname?: string | null }[]
  value: string
  onChange: (v: string) => void
}) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const picked = students.find((s) => s.id === value)
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return students.slice(0, 30)
    return students
      .filter(
        (s) => s.name.toLowerCase().includes(q) || (s.nickname ?? '').toLowerCase().includes(q),
      )
      .slice(0, 50)
  }, [students, search])
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <div className="relative">
        <Search
          size={14}
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <Input
          id="p-murid"
          value={open ? search : picked?.name ?? ''}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setSearch(e.target.value)
            if (!open) setOpen(true)
          }}
          placeholder={t('achievement.muridSearchPh')}
          className="pl-8 pr-8"
        />
        {picked ? (
          <button
            type="button"
            onClick={() => {
              onChange('')
              setSearch('')
              setOpen(false)
            }}
            className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label={t('achievement.muridRemoveAria')}
          >
            <X size={12} />
          </button>
        ) : null}
      </div>
      {open ? (
        <div
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg"
          onMouseLeave={() => setOpen(false)}
        >
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-xs text-slate-500">{t('achievement.noMuridMatch')}</p>
          ) : (
            filtered.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  onChange(s.id)
                  setSearch('')
                  setOpen(false)
                }}
                className={
                  'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition ' +
                  (s.id === value ? 'bg-sky-50' : 'hover:bg-slate-50')
                }
              >
                <span className="flex-1 truncate">{s.name}</span>
                {s.nickname ? (
                  <span className="text-[10px] text-slate-500">{s.nickname}</span>
                ) : null}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}

// UmurSemCombo — search-as-you-type combobox for picking a (umur, semester)
// option. Used for both "Umur dari" and "Umur sampai" in the filter card.
function UmurSemCombo({
  id,
  options,
  value,
  onChange,
  placeholder,
}: {
  id: string
  options: { key: string; umur: number; sem: 1 | 2; label: string; tingkat: string }[]
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const picked = options.find((o) => o.key === value)
  const display = picked
    ? `${picked.umur} ${t('achievement.umurUnit')} · ${t('achievement.semUnit', { n: picked.sem })}`
    : ''
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return options
    return options.filter(
      (o) =>
        String(o.umur).includes(q) ||
        o.tingkat.toLowerCase().includes(q) ||
        o.label.toLowerCase().includes(q),
    )
  }, [options, search])
  return (
    <div className="relative">
      <div className="relative">
        <Search
          size={14}
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <Input
          id={id}
          value={open ? search : display}
          onFocus={() => {
            setOpen(true)
            setSearch('')
          }}
          onChange={(e) => {
            setSearch(e.target.value)
            if (!open) setOpen(true)
          }}
          placeholder={placeholder}
          className="pl-8 pr-7"
        />
        {value ? (
          <button
            type="button"
            onClick={() => {
              onChange('')
              setSearch('')
              setOpen(false)
            }}
            className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label={t('achievement.umurClearAria')}
          >
            <X size={12} />
          </button>
        ) : null}
      </div>
      {open ? (
        <div
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg"
          onMouseLeave={() => setOpen(false)}
        >
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-xs text-slate-500">{t('achievement.notFound')}</p>
          ) : (
            filtered.map((o) => (
              <button
                key={o.key}
                type="button"
                onClick={() => {
                  onChange(o.key)
                  setSearch('')
                  setOpen(false)
                }}
                className={
                  'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition ' +
                  (o.key === value ? 'bg-sky-50' : 'hover:bg-slate-50')
                }
              >
                <span className="font-medium tabular-nums">{o.umur} {t('achievement.umurUnit')}</span>
                <span className="text-xs text-slate-500">{t('achievement.semUnit', { n: o.sem })}</span>
                <span className="ml-auto text-[10px] text-slate-500">{o.tingkat}</span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}

// --------------------------------------------------------------- Pencapaian tree

type Grouped = {
  tema: string
  rows: PencapaianRow[]
  subs: {
    subTema: string
    rows: PencapaianRow[]
    kelompoks: { kelompokMateri: string; rows: PencapaianRow[] }[]
    flat: PencapaianRow[]
  }[]
}

function PencapaianTree({
  rows,
  canEdit,
  muridUserId,
}: {
  rows: PencapaianRow[]
  canEdit: boolean
  muridUserId: string
}) {
  const { t } = useTranslation()
  const grouped = useMemo(() => groupRows(rows), [rows])

  const [openTemas, setOpenTemas] = useState<Set<string>>(new Set())
  const [openSubs, setOpenSubs] = useState<Set<string>>(new Set())
  const [openKels, setOpenKels] = useState<Set<string>>(new Set())

  const toggle = (s: Set<string>, key: string, setter: (s: Set<string>) => void) =>
    setter(new Set(s.has(key) ? [...s].filter((x) => x !== key) : [...s, key]))

  const overall = useMemo(() => stats(rows), [rows])

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
          {t('achievement.progressOverall')}
        </div>
        <ProgressRow stats={overall} />
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        {grouped.map((g) => {
          const tCollapsed = !openTemas.has(g.tema)
          const color = TEMA_COLOR[g.tema] || '#475569'
          const s = stats(g.rows)
          return (
            <div
              key={g.tema}
              className="border-b border-slate-100 last:border-b-0"
              style={{ borderLeft: `4px solid ${color}` }}
            >
              <button
                type="button"
                onClick={() => toggle(openTemas, g.tema, setOpenTemas)}
                className="grid w-full grid-cols-[1.5rem_minmax(0,1fr)_8rem_3rem] items-center gap-2 px-3 py-2 text-left transition hover:bg-slate-50"
                style={{ color }}
              >
                {tCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                <span className="truncate font-semibold">{TEMA_LABEL[g.tema] || g.tema}</span>
                <MiniBar stats={s} />
                <span className="text-right text-xs font-medium tabular-nums">{s.pct}%</span>
              </button>
              {!tCollapsed
                ? g.subs.map((sub) => {
                    const subKey = `${g.tema}::${sub.subTema}`
                    const sCollapsed = !openSubs.has(subKey)
                    const subS = stats(sub.rows)
                    return (
                      <div key={subKey} className="border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => toggle(openSubs, subKey, setOpenSubs)}
                          className="grid w-full grid-cols-[1.5rem_minmax(0,1fr)_8rem_3rem] items-center gap-2 px-5 py-1.5 text-left transition hover:bg-slate-50"
                        >
                          {sCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                          <span className="truncate text-sm font-medium">{sub.subTema}</span>
                          <MiniBar stats={subS} />
                          <span className="text-right text-xs font-medium tabular-nums">
                            {subS.pct}%
                          </span>
                        </button>
                        {!sCollapsed ? (
                          <div>
                            {sub.kelompoks.map((kg) => {
                              const kKey = `${subKey}::${kg.kelompokMateri}`
                              const kCollapsed = !openKels.has(kKey)
                              const kelS = stats(kg.rows)
                              return (
                                <div key={kKey} className="border-t border-slate-100">
                                  <button
                                    type="button"
                                    onClick={() => toggle(openKels, kKey, setOpenKels)}
                                    className="grid w-full grid-cols-[1.5rem_minmax(0,1fr)_8rem_3rem] items-center gap-2 px-7 py-1.5 text-left transition hover:bg-slate-50"
                                  >
                                    {kCollapsed ? (
                                      <ChevronRight size={12} />
                                    ) : (
                                      <ChevronDown size={12} />
                                    )}
                                    <span className="truncate text-[11px] uppercase tracking-wide text-slate-600">
                                      {kg.kelompokMateri}
                                    </span>
                                    <MiniBar stats={kelS} />
                                    <span className="text-right text-xs font-medium tabular-nums">
                                      {kelS.pct}%
                                    </span>
                                  </button>
                                  {!kCollapsed ? (
                                    <ul className="bg-slate-50/50">
                                      {kg.rows.map((r) => (
                                        <MateriRow
                                          key={r.materi.id}
                                          row={r}
                                          canEdit={canEdit}
                                          muridUserId={muridUserId}
                                        />
                                      ))}
                                    </ul>
                                  ) : null}
                                </div>
                              )
                            })}
                            {sub.flat.length > 0 ? (
                              <ul className="bg-slate-50/50">
                                {sub.flat.map((r) => (
                                  <MateriRow
                                    key={r.materi.id}
                                    row={r}
                                    canEdit={canEdit}
                                    muridUserId={muridUserId}
                                  />
                                ))}
                              </ul>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    )
                  })
                : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function groupRows(rows: PencapaianRow[]): Grouped[] {
  const byTema: Record<string, PencapaianRow[]> = {}
  for (const r of rows) {
    const tema = (r.materi.tema || '').toUpperCase() || '(TANPA TEMA)'
    ;(byTema[tema] = byTema[tema] || []).push(r)
  }
  const orderedKeys = [
    ...TEMA_ORDER.filter((k) => byTema[k]),
    ...Object.keys(byTema).filter((k) => !TEMA_ORDER.includes(k)).sort(),
  ]
  return orderedKeys.map<Grouped>((tema) => {
    const subBuckets: Record<string, PencapaianRow[]> = {}
    const subOrder: string[] = []
    for (const r of byTema[tema]) {
      const sub = r.materi.subTema || '—'
      if (!subBuckets[sub]) {
        subBuckets[sub] = []
        subOrder.push(sub)
      }
      subBuckets[sub].push(r)
    }
    const subs = subOrder.map((subTema) => {
      const subRows = subBuckets[subTema]
      const byKel: Record<string, PencapaianRow[]> = {}
      const kelOrder: string[] = []
      for (const r of subRows) {
        const k = (r.materi.kelompokMateri || '').trim()
        if (!byKel[k]) {
          byKel[k] = []
          kelOrder.push(k)
        }
        byKel[k].push(r)
      }
      const kelompoks = kelOrder
        .filter((k) => k && byKel[k].length >= 2)
        .map((kelompokMateri) => ({ kelompokMateri, rows: byKel[kelompokMateri] }))
      const groupedIds = new Set(kelompoks.flatMap((kg) => kg.rows.map((x) => x.materi.id)))
      const flat = subRows.filter((x) => !groupedIds.has(x.materi.id))
      return { subTema, rows: subRows, kelompoks, flat }
    })
    return { tema, rows: byTema[tema], subs }
  })
}

type Stats = { total: number; tuntas: number; proses: number; pct: number }

function stats(rows: PencapaianRow[]): Stats {
  const total = rows.length
  let tuntas = 0
  let proses = 0
  for (const r of rows) {
    const s = r.pencapaian?.status
    if (s === 'tuntas') tuntas++
    else if (s === 'proses') proses++
  }
  const pct = total > 0 ? Math.round((tuntas / total) * 100) : 0
  return { total, tuntas, proses, pct }
}

function MiniBar({ stats: s }: { stats: Stats }) {
  const { t } = useTranslation()
  if (s.total === 0) {
    return <div className="h-2 w-full rounded-full bg-slate-100" />
  }
  const tuntasPct = (s.tuntas / s.total) * 100
  const prosesPct = (s.proses / s.total) * 100
  return (
    <div
      className="flex h-2 w-full overflow-hidden rounded-full bg-slate-100"
      title={t('achievement.miniBarTitle', { tuntas: s.tuntas, total: s.total, proses: s.proses })}
    >
      <div className="bg-emerald-500" style={{ width: `${tuntasPct}%` }} />
      <div className="bg-amber-400" style={{ width: `${prosesPct}%` }} />
    </div>
  )
}

function ProgressRow({ stats: s }: { stats: Stats }) {
  const { t } = useTranslation()
  return (
    <div className="mt-1">
      <div className="text-2xl font-semibold text-emerald-900">
        {s.tuntas}{' '}
        <span className="text-base font-normal text-emerald-700">
          {t('achievement.tuntasOf', { total: s.total, pct: s.pct })}
        </span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-emerald-200">
        <div className="h-full bg-emerald-600" style={{ width: `${s.pct}%` }} />
      </div>
      {s.proses > 0 ? (
        <div className="mt-1 text-xs text-amber-700">{t('achievement.prosesCount', { count: s.proses })}</div>
      ) : null}
    </div>
  )
}

// -------------------------------------------------------------- Materi row

function MateriRow({
  row,
  canEdit,
  muridUserId,
}: {
  row: PencapaianRow
  canEdit: boolean
  muridUserId: string
}) {
  const { t } = useTranslation()
  const m: MateriAjar = row.materi
  const status: PencapaianStatus = row.pencapaian?.status ?? 'belum'
  const toast = useToast()
  const qc = useQueryClient()
  const mut = useMutation({
    mutationFn: (next: PencapaianStatus) =>
      upsertPencapaian({
        muridUserId,
        materiAjarId: m.id,
        status: next,
        tanggal: new Date().toISOString().slice(0, 10),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pencapaian', muridUserId] })
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : t('achievement.saveFailed'), 'error'),
  })

  const cycle = () => {
    const i = STATUS_CYCLE.indexOf(status)
    mut.mutate(STATUS_CYCLE[(i + 1) % STATUS_CYCLE.length])
  }

  return (
    <li>
      <div className="flex items-start gap-3 px-9 py-1.5 text-sm">
        <button
          type="button"
          onClick={canEdit ? cycle : undefined}
          disabled={!canEdit || mut.isPending}
          className={cn(
            'mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border-2 transition',
            status === 'tuntas'
              ? 'border-emerald-500 bg-emerald-500 text-white'
              : status === 'proses'
              ? 'border-amber-500 bg-amber-100 text-amber-700'
              : 'border-slate-300 bg-white text-transparent',
            canEdit && 'hover:border-emerald-400',
            !canEdit && 'cursor-default opacity-70',
          )}
          aria-label={t('achievement.statusLabel', { status })}
          title={t('achievement.statusLabelTitle', { status })}
        >
          {status === 'tuntas' ? (
            <Check size={14} />
          ) : status === 'proses' ? (
            <Minus size={14} />
          ) : null}
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] text-slate-500">
            {t('achievement.rowSemKode', { sem: m.semester, kode: m.kodeMateri })}
            {row.umur != null ? t('achievement.rowUmur', { umur: row.umur }) : ''}
          </div>
          <div className={status === 'tuntas' ? 'font-medium text-slate-900' : 'text-slate-800'}>
            {m.detailMateri}
          </div>
          {row.pencapaian?.catatan ? (
            <div className="mt-0.5 text-xs text-slate-500">{row.pencapaian.catatan}</div>
          ) : null}
        </div>
      </div>
    </li>
  )
}

// =========================================================== Library tab

type RangePreset = '1m' | '3m' | 's1' | 's2' | '1y'

function LibraryTab() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const isMurid = user?.role === 'murid'
  const [muridUserId, setMuridUserId] = useState<string>(isMurid ? user!.id : '')
  const today = new Date()
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  const [fromDate, setFromDate] = useState<string>(iso(new Date(today.getFullYear(), today.getMonth() - 1, today.getDate())))
  const [toDate, setToDate] = useState<string>(iso(today))

  const applyPreset = (p: RangePreset) => {
    const now = new Date()
    let f = new Date(now)
    let t = new Date(now)
    if (p === '1m') f.setMonth(now.getMonth() - 1)
    else if (p === '3m') f.setMonth(now.getMonth() - 3)
    else if (p === '1y') f.setFullYear(now.getFullYear() - 1)
    else if (p === 's1') {
      // Semester 1 = Juli–Desember
      const year = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1
      f = new Date(year, 6, 1)
      t = new Date(year, 11, 31)
    } else if (p === 's2') {
      // Semester 2 = Januari–Juni
      const year = now.getMonth() < 6 ? now.getFullYear() : now.getFullYear() + 1
      f = new Date(year, 0, 1)
      t = new Date(year, 5, 30)
    }
    setFromDate(iso(f))
    setToDate(iso(t))
  }

  const { data: students } = useQuery({
    queryKey: ['students', { all: true }],
    queryFn: () => listStudents({ status: 'active', limit: 500 }),
    enabled: !isMurid,
    staleTime: 60_000,
  })

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <div className="space-y-3">
          <Field label={t('achievement.muridLabel')} htmlFor="lib-murid">
            {isMurid ? (
              <div className="flex h-10 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm">
                {user?.name}
              </div>
            ) : (
              <MuridPicker
                students={students?.items ?? []}
                value={muridUserId}
                onChange={setMuridUserId}
              />
            )}
          </Field>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field label={t('achievement.libFromLabel')} htmlFor="lib-from">
              <Input
                id="lib-from"
                type="date"
                className="w-full min-w-0"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </Field>
            <Field label={t('achievement.libToLabel')} htmlFor="lib-to">
              <Input
                id="lib-to"
                type="date"
                className="w-full min-w-0"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </Field>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {([
              ['1m', t('achievement.preset1m')],
              ['3m', t('achievement.preset3m')],
              ['s1', t('achievement.presetS1')],
              ['s2', t('achievement.presetS2')],
              ['1y', t('achievement.preset1y')],
            ] as [RangePreset, string][]).map(([p, lbl]) => (
              <button
                key={p}
                type="button"
                onClick={() => applyPreset(p)}
                className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!muridUserId ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center text-sm text-slate-500">
          {t('achievement.libPickMurid')}
        </div>
      ) : (
        <LibraryTrackerGrid muridUserId={muridUserId} fromDate={fromDate} toDate={toDate} />
      )}
    </div>
  )
}

// Parsers — mirror the ref-string conventions written by MateriSourcePicker
// + the importer. Quran: "<surah>" | "<surah>:<ayat>" | "<surah>:<a>-<b>".
// Hadits: "<slug>" | "<slug>#<nomor>" | "<slug>#<a>-<b>". Tilawati:
// "<jilid>" | "<jilid>:<page>" | "<jilid>:<a>-<b>".
function parseQuranRef(ref: string): { surah: number; from?: number; to?: number } | null {
  const [s, range] = ref.split(':')
  const surah = Number(s)
  if (!surah || surah < 1 || surah > 114) return null
  if (!range) return { surah }
  if (range.includes('-')) {
    const [a, b] = range.split('-').map((x) => Number(x.trim()))
    if (!a) return { surah }
    return { surah, from: a, to: b || a }
  }
  const a = Number(range)
  if (!a) return { surah }
  return { surah, from: a, to: a }
}

function parseHaditsRef(ref: string): { slug: string; from?: number; to?: number } | null {
  if (!ref) return null
  const hashIdx = ref.indexOf('#')
  if (hashIdx < 0) return { slug: ref }
  const slug = ref.slice(0, hashIdx)
  const range = ref.slice(hashIdx + 1)
  if (!slug) return null
  if (!range) return { slug }
  if (range.includes('-')) {
    const [a, b] = range.split('-').map((x) => Number(x.trim()))
    if (!a) return { slug }
    return { slug, from: a, to: b || a }
  }
  const a = Number(range)
  if (!a) return { slug }
  return { slug, from: a, to: a }
}

function parseTilawatiRef(ref: string): { jilid: string; from?: number; to?: number } | null {
  const [j, range] = ref.split(':')
  if (!j) return null
  if (!range) return { jilid: j }
  if (range.includes('-')) {
    const [a, b] = range.split('-').map((x) => Number(x.trim()))
    if (!a) return { jilid: j }
    return { jilid: j, from: a, to: b || a }
  }
  const a = Number(range)
  if (!a) return { jilid: j }
  return { jilid: j, from: a, to: a }
}

const QURAN_TOTAL_AYAT = 6236
const HADITS_HIMPUNAN_PAGES = 2607 // sum of seeded jumlah_halaman across 24 kitab himpunan

function LibraryTrackerGrid({
  muridUserId,
  fromDate,
  toDate,
}: {
  muridUserId: string
  fromDate: string
  toDate: string
}) {
  const { t, i18n } = useTranslation()
  // Pull all bacaan_log rows for the murid in the date range. From this we
  // derive Quran reciting/manqul/hafalan via source/aspect proxy.
  useQuery({
    queryKey: ['bacaan', muridUserId, fromDate, toDate],
    queryFn: () => listBacaan({ userId: muridUserId, from: fromDate, to: toDate, limit: 1000 }),
  })

  // Pencapaian library rows — every (kind, ref) the murid was ever taught
  // through a sesi (live or imported historis). Powers the main aggregate
  // tiles AND the per-item sub-pies.
  const { data: pencapaian = [] } = useQuery({
    queryKey: ['pencapaian-library', muridUserId],
    queryFn: () => listLibraryPencapaian(muridUserId),
    enabled: !!muridUserId,
  })

  const { data: surahs = [] } = useQuery({
    queryKey: ['quran-surahs'],
    queryFn: listQuranSurahs,
    staleTime: 60 * 60_000,
  })
  const surahById = useMemo(() => {
    const m: Record<number, (typeof surahs)[number]> = {}
    for (const s of surahs) m[s.id] = s
    return m
  }, [surahs])

  const { data: kitabs = [] } = useQuery({
    queryKey: ['hadits-kitab', 'hadits'],
    queryFn: () => listKitab('hadits'),
    staleTime: 60 * 60_000,
  })
  const kitabBySlug = useMemo(() => {
    const m: Record<string, (typeof kitabs)[number]> = {}
    for (const k of kitabs) m[k.slug] = k
    return m
  }, [kitabs])

  const { data: doaList = [] } = useQuery({
    queryKey: ['doa-list'],
    queryFn: () => listDoa({}),
    staleTime: 60 * 60_000,
  })

  // Aspect-scoped breakdown: per (kind, aspect) we keep enough data to render
  // a main aggregate pie AND derive per-item pies (per surat / per kitab /
  // per jilid / per doa). aspect "" = unspecified (legacy rows without an
  // aspect tag); rendered as "Lainnya".
  const breakdown = useMemo(() => {
    type QuranItem = { covered: Set<number> }
    type HaditsItem = { covered: Set<number>; whole: boolean }
    type TilawatiItem = { covered: Set<number> }
    const quran = new Map<string, Map<number, QuranItem>>()    // aspect → surah → bucket
    const hadits = new Map<string, Map<string, HaditsItem>>()  // aspect → slug → bucket
    const tilawati = new Map<string, Map<string, TilawatiItem>>() // aspect → jilid → bucket
    const doa = new Map<string, Set<string>>()                  // aspect → set(doaId)
    for (const p of pencapaian) {
      const aspect = p.libraryAspect ?? ''
      if (p.libraryKind === 'quran' && p.libraryRef) {
        const parsed = parseQuranRef(p.libraryRef)
        if (!parsed) continue
        const total = surahById[parsed.surah]?.jumlahAyat ?? 0
        let byAspect = quran.get(aspect)
        if (!byAspect) {
          byAspect = new Map()
          quran.set(aspect, byAspect)
        }
        const cur = byAspect.get(parsed.surah) ?? { covered: new Set<number>() }
        if (parsed.from && parsed.to) {
          for (let a = parsed.from; a <= parsed.to && a <= total; a++) cur.covered.add(a)
        } else if (total > 0) {
          for (let a = 1; a <= total; a++) cur.covered.add(a)
        }
        byAspect.set(parsed.surah, cur)
      } else if (p.libraryKind === 'hadits' && p.libraryRef) {
        const parsed = parseHaditsRef(p.libraryRef)
        if (!parsed) continue
        let byAspect = hadits.get(aspect)
        if (!byAspect) {
          byAspect = new Map()
          hadits.set(aspect, byAspect)
        }
        const cur = byAspect.get(parsed.slug) ?? { covered: new Set<number>(), whole: false }
        if (parsed.from && parsed.to) {
          for (let n = parsed.from; n <= parsed.to; n++) cur.covered.add(n)
        } else {
          cur.whole = true
        }
        byAspect.set(parsed.slug, cur)
      } else if (p.libraryKind === 'tilawati' && p.libraryRef) {
        const parsed = parseTilawatiRef(p.libraryRef)
        if (!parsed) continue
        // Tilawati intro pages (1..TILAWATI_LEARNING_START-1) are cover and
        // table-of-contents pages — they do not count toward achievement.
        // Use the printed page range as the iteration bound but only add
        // pages that are real learning content. Bounds use the full printed
        // page count so refs naming page 46 still register.
        const total = (TILAWATI_LEARNING_PAGES_BY_JILID[parsed.jilid] ?? 44) + TILAWATI_LEARNING_START - 1
        let byAspect = tilawati.get(aspect)
        if (!byAspect) {
          byAspect = new Map()
          tilawati.set(aspect, byAspect)
        }
        const cur = byAspect.get(parsed.jilid) ?? { covered: new Set<number>() }
        if (parsed.from && parsed.to) {
          const lo = Math.max(parsed.from, TILAWATI_LEARNING_START)
          const hi = Math.min(parsed.to, total)
          for (let pg = lo; pg <= hi; pg++) cur.covered.add(pg)
        } else {
          for (let pg = TILAWATI_LEARNING_START; pg <= total; pg++) cur.covered.add(pg)
        }
        byAspect.set(parsed.jilid, cur)
      } else if (p.libraryKind === 'doa' && p.libraryRef) {
        let set = doa.get(aspect)
        if (!set) {
          set = new Set<string>()
          doa.set(aspect, set)
        }
        set.add(p.libraryRef)
      }
    }
    return { quran, hadits, tilawati, doa }
  }, [pencapaian, surahById])

  // Pre-defined main pies: per (kind, aspect). Aspects that don't make sense
  // for a kind are skipped (e.g. Hadits only has manqul). aspect "" is used
  // for "no aspect attached" — legacy/imported sesi often omit it.
  type MainTile = {
    kind: 'quran' | 'hadits' | 'tilawati' | 'doa'
    aspect: '' | 'reciting' | 'memorizing' | 'review' | 'manqul'
    label: string
    icon: string
    done: number
    total: number
    unit: string
  }
  const ASPECT_LABEL_ID: Record<string, string> = {
    reciting: t('achievement.aspectReciting'),
    memorizing: t('achievement.aspectMemorizing'),
    review: t('achievement.aspectReview'),
    manqul: t('achievement.aspectManqul'),
    '': t('achievement.aspectOther'),
  }
  const KIND_LABEL_ID: Record<MainTile['kind'], string> = {
    quran: t('achievement.kindQuran'),
    hadits: t('achievement.kindHadits'),
    tilawati: t('achievement.kindTilawati'),
    doa: t('achievement.kindDoa'),
  }
  const KIND_ICON: Record<MainTile['kind'], string> = {
    quran: '📖',
    hadits: '📜',
    tilawati: '📚',
    doa: '🤲',
  }

  const haditsTotalPages = useMemo(() => {
    let tot = 0
    for (const k of kitabs) tot += k.jumlahHalaman
    return tot || HADITS_HIMPUNAN_PAGES
  }, [kitabs])

  // Build main tiles for every (kind, aspect) combination that has data.
  const mainTiles: MainTile[] = useMemo(() => {
    const out: MainTile[] = []
    // QURAN per aspect
    for (const [aspect, byAspect] of breakdown.quran) {
      let covered = 0
      for (const [, b] of byAspect) covered += b.covered.size
      out.push({
        kind: 'quran',
        aspect: aspect as MainTile['aspect'],
        label: `${KIND_LABEL_ID.quran} · ${ASPECT_LABEL_ID[aspect] ?? aspect}`,
        icon: KIND_ICON.quran,
        done: covered,
        total: QURAN_TOTAL_AYAT,
        unit: t('achievement.unitAyat'),
      })
    }
    // HADITS per aspect
    for (const [aspect, byAspect] of breakdown.hadits) {
      let halaman = 0
      for (const [slug, b] of byAspect) {
        const k = kitabBySlug[slug]
        if (!k) continue
        if (b.whole) halaman += k.jumlahHalaman
        else if (k.haditsCount > 0) {
          halaman += Math.round((b.covered.size / k.haditsCount) * k.jumlahHalaman)
        }
      }
      out.push({
        kind: 'hadits',
        aspect: aspect as MainTile['aspect'],
        label: `${KIND_LABEL_ID.hadits} · ${ASPECT_LABEL_ID[aspect] ?? aspect}`,
        icon: KIND_ICON.hadits,
        done: Math.min(halaman, haditsTotalPages),
        total: haditsTotalPages,
        unit: t('achievement.unitHalaman'),
      })
    }
    // TILAWATI per aspect
    for (const [aspect, byAspect] of breakdown.tilawati) {
      let pages = 0
      for (const [, b] of byAspect) pages += b.covered.size
      out.push({
        kind: 'tilawati',
        aspect: aspect as MainTile['aspect'],
        label: `${KIND_LABEL_ID.tilawati} · ${ASPECT_LABEL_ID[aspect] ?? aspect}`,
        icon: KIND_ICON.tilawati,
        done: Math.min(pages, TILAWATI_TOTAL_LEARNING_PAGES),
        total: TILAWATI_TOTAL_LEARNING_PAGES,
        unit: t('achievement.unitHalaman'),
      })
    }
    // DOA per aspect
    for (const [aspect, set] of breakdown.doa) {
      out.push({
        kind: 'doa',
        aspect: aspect as MainTile['aspect'],
        label: `${KIND_LABEL_ID.doa} · ${ASPECT_LABEL_ID[aspect] ?? aspect}`,
        icon: KIND_ICON.doa,
        done: set.size,
        total: doaList.length || set.size || 1,
        unit: t('achievement.unitDoa'),
      })
    }
    return out.sort((a, b) =>
      a.kind === b.kind ? a.aspect.localeCompare(b.aspect) : a.kind.localeCompare(b.kind),
    )
  }, [breakdown, kitabBySlug, haditsTotalPages, doaList])

  // Currently picked tile = which (kind, aspect) the user clicked. null →
  // no detail panel shown.
  const [pickedTile, setPickedTile] = useState<{
    kind: MainTile['kind']
    aspect: MainTile['aspect']
  } | null>(null)

  // Reset selection when the murid changes.
  useEffect(() => {
    setPickedTile(null)
  }, [muridUserId])

  // Per-item pies for the selected (kind, aspect).
  type ItemTile = { key: string; label: string; done: number; total: number; sortBy: number }
  const itemTiles: ItemTile[] = useMemo(() => {
    if (!pickedTile) return []
    const { kind, aspect } = pickedTile
    if (kind === 'quran') {
      const byAspect = breakdown.quran.get(aspect)
      if (!byAspect) return []
      const out: ItemTile[] = []
      for (const [surah, b] of byAspect) {
        const total = surahById[surah]?.jumlahAyat ?? 0
        const nama = surahById[surah]?.nama ?? `${t('pustaka.refLabel.surahFallback')} ${surah}`
        out.push({
          key: `quran-${surah}`,
          label: `${surah}. ${nama}`,
          done: b.covered.size,
          total,
          sortBy: surah,
        })
      }
      return out.sort((a, b) => a.sortBy - b.sortBy)
    }
    if (kind === 'hadits') {
      const byAspect = breakdown.hadits.get(aspect)
      if (!byAspect) return []
      const out: ItemTile[] = []
      for (const [slug, b] of byAspect) {
        const k = kitabBySlug[slug]
        const total = k?.haditsCount ?? 0
        const nama = k?.nama ?? slug
        const done = b.whole ? total : b.covered.size
        out.push({
          key: `hadits-${slug}`,
          label: nama,
          done,
          total: total || done || 1,
          sortBy: k?.urutan ?? 999,
        })
      }
      return out.sort((a, b) => a.sortBy - b.sortBy)
    }
    if (kind === 'tilawati') {
      const byAspect = breakdown.tilawati.get(aspect)
      if (!byAspect) return []
      const out: ItemTile[] = []
      for (const [jilid, b] of byAspect) {
        const total = TILAWATI_LEARNING_PAGES_BY_JILID[jilid] ?? 44
        out.push({
          key: `tilawati-${jilid}`,
          label: `${t('pustaka.refLabel.jilid')} ${jilid}`,
          done: b.covered.size,
          total,
          sortBy: Number(jilid) || 99,
        })
      }
      return out.sort((a, b) => a.sortBy - b.sortBy)
    }
    if (kind === 'doa') {
      const set = breakdown.doa.get(aspect)
      if (!set) return []
      const out: ItemTile[] = []
      let i = 0
      for (const id of set) {
        const d = doaList.find((x) => x.id === id)
        out.push({
          key: `doa-${id}`,
          label: d?.nama ?? id.slice(0, 8),
          done: 1,
          total: 1,
          sortBy: i++,
        })
      }
      return out.sort((a, b) => a.label.localeCompare(b.label))
    }
    return []
  }, [pickedTile, breakdown, surahById, kitabBySlug, doaList])

  // Riwayat list filtered by the selected (kind, aspect). One row per
  // pencapaian entry, sorted by tanggal desc.
  const riwayat = useMemo(() => {
    if (!pickedTile) return []
    return pencapaian
      .filter(
        (p) =>
          p.libraryKind === pickedTile.kind &&
          (p.libraryAspect ?? '') === pickedTile.aspect,
      )
      .sort((a, b) => (b.tanggal ?? '').localeCompare(a.tanggal ?? ''))
  }, [pencapaian, pickedTile])

  if (mainTiles.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
        {t('achievement.libEmpty')}
      </div>
    )
  }

  return (
    <>
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">
            {t('achievement.libHeading')}
          </h3>
          <p className="text-[11px] text-slate-500">
            {t('achievement.libHint')}
          </p>
        </div>
        <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
          {mainTiles.map((tile) => {
            const selected =
              pickedTile?.kind === tile.kind && pickedTile?.aspect === tile.aspect
            return (
              <button
                key={`${tile.kind}-${tile.aspect}`}
                type="button"
                onClick={() =>
                  setPickedTile((cur) =>
                    cur && cur.kind === tile.kind && cur.aspect === tile.aspect
                      ? null
                      : { kind: tile.kind, aspect: tile.aspect },
                  )
                }
                className={cn(
                  'flex w-32 flex-shrink-0 flex-col items-center rounded-lg border p-2 text-center transition',
                  selected
                    ? 'border-emerald-500 bg-emerald-50 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50',
                )}
              >
                <DonutChart
                  pct={tile.total > 0 ? Math.min(100, Math.round((tile.done / tile.total) * 100)) : 0}
                  centerLabel={`${tile.total > 0 ? Math.min(100, Math.round((tile.done / tile.total) * 100)) : 0}%`}
                />
                <div className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-slate-800">
                  <span className="text-sm">{tile.icon}</span>
                  <span className="line-clamp-2">{tile.label}</span>
                </div>
                <div className="text-[10px] text-slate-500">
                  {tile.done.toLocaleString(i18n.language === 'en' ? 'en-US' : 'id-ID')} / {tile.total.toLocaleString(i18n.language === 'en' ? 'en-US' : 'id-ID')} {tile.unit}
                </div>
              </button>
            )
          })}
        </div>

        {pickedTile && itemTiles.length > 0 ? (
          <div className="mt-4 border-t border-slate-200 pt-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t('achievement.libPerItem', { count: itemTiles.length })}
            </div>
            <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
              {itemTiles.map((tile) => {
                const pct = tile.total > 0 ? Math.min(100, Math.round((tile.done / tile.total) * 100)) : 0
                return (
                  <div
                    key={tile.key}
                    className="flex w-28 flex-shrink-0 flex-col items-center rounded-lg border border-slate-200 bg-white p-2 text-center"
                  >
                    <DonutChart pct={pct} centerLabel={`${pct}%`} />
                    <div className="mt-1 line-clamp-2 text-[11px] font-medium text-slate-800">
                      {tile.label}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {tile.done}/{tile.total}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : null}
      </div>

      {pickedTile ? (
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="sticky top-0 z-10 flex items-center justify-between rounded-t-lg border-b border-slate-200 bg-white/95 px-4 py-2 backdrop-blur">
            <h3 className="text-sm font-semibold text-slate-900">
              {t('achievement.libRiwayatHeading', {
                kind: KIND_LABEL_ID[pickedTile.kind],
                aspect: ASPECT_LABEL_ID[pickedTile.aspect] ?? t('achievement.aspectOther'),
              })}
              <span className="ml-2 text-xs font-normal text-slate-500">
                {t('achievement.libRiwayatEntries', { count: riwayat.length })}
              </span>
            </h3>
            <button
              type="button"
              onClick={() => setPickedTile(null)}
              className="rounded-md p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              aria-label={t('achievement.libCloseAria')}
            >
              <X size={16} />
            </button>
          </div>
          <div className="max-h-[60vh] overflow-y-auto px-4 py-2">
            {riwayat.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">
                {t('achievement.libRiwayatEmpty')}
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {riwayat.map((p) => (
                  <li key={p.id} className="flex items-start gap-3 py-2">
                    <span className="w-20 flex-shrink-0 text-xs tabular-nums text-slate-500">
                      {(p.tanggal ?? '').slice(0, 10) || '—'}
                    </span>
                    <span className="min-w-0 flex-1">
                      <LibraryRefLabel
                        libraryKind={p.libraryKind as 'quran' | 'hadits' | 'tilawati' | 'doa'}
                        libraryRef={p.libraryRef}
                        libraryAspect={p.libraryAspect}
                        showKind={false}
                      />
                    </span>
                    <span
                      className={cn(
                        'inline-block flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                        p.status === 'tuntas'
                          ? 'bg-emerald-100 text-emerald-700'
                          : p.status === 'proses'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-slate-100 text-slate-600',
                      )}
                    >
                      {p.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}

    </>
  )
}

// DonutChart — slightly bigger version for the Library tab tiles. Matches
// the look of KontrolBacaan's per-surah donuts.
function DonutChart({ pct, centerLabel }: { pct: number; centerLabel: string }) {
  const radius = 40
  const circumference = 2 * Math.PI * radius
  const filled = Math.max(0, Math.min(100, pct)) / 100
  return (
    <div className="relative h-16 w-16">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="#d1fae5" strokeWidth="14" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="#059669"
          strokeWidth="14"
          strokeDasharray={`${filled * circumference} ${circumference}`}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-emerald-900">
        {centerLabel}
      </div>
    </div>
  )
}

