import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, Pencil, Play, Plus, Radio, RotateCcw, Square, Trash2, X } from 'lucide-react'
import { Link } from 'react-router-dom'

import {
  deleteSesi,
  listSesi,
  startSesi,
  type Sesi,
} from '@/api/sesi'
import { listTingkat } from '@/api/kurikulum'
import { listKelas } from '@/api/kelas'
import { ApiError } from '@/api/client'
import { Button } from '@/components/Button'
import { PageShell } from '@/components/PageShell'
import { RescheduleSesiDialog } from '@/components/RescheduleSesiDialog'
import { EndSesiSummaryDialog } from '@/components/EndSesiSummaryDialog'
import { SesiFormDialog } from '@/components/SesiFormDialog'
import { useAuth } from '@/lib/auth'
import { useToast } from '@/lib/toast'
import { useConfirm } from '@/lib/confirm'

// Calendar utilities --------------------------------------------------------

function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n)
}

// Format a JS Date as local YYYY-MM-DD (avoid UTC drift from toISOString).
function localDate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function shiftDate(iso: string, deltaDays: number): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  d.setDate(d.getDate() + deltaDays)
  return localDate(d)
}

type Status = 'scheduled' | 'ongoing' | 'completed' | 'missed'

function statusOf(s: Sesi, today: Date): Status {
  if (s.endedAt) return 'completed'
  if (s.startedAt) return 'ongoing'
  const iso = (s.tanggal || '').slice(0, 10)
  if (iso && iso < localDate(today)) return 'missed'
  return 'scheduled'
}

const STATUS_CLASSES: Record<Status, { dot: string; chip: string; bar: string }> = {
  scheduled: {
    dot: 'bg-sky-500',
    chip: 'bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-200',
    bar: 'border-l-2 border-sky-500 bg-sky-50 text-sky-800',
  },
  ongoing: {
    dot: 'bg-amber-500',
    chip: 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200',
    bar: 'border-l-2 border-amber-500 bg-amber-50 text-amber-800',
  },
  completed: {
    dot: 'bg-emerald-500',
    chip: 'bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200',
    bar: 'border-l-2 border-emerald-500 bg-emerald-50 text-emerald-800',
  },
  missed: {
    dot: 'bg-rose-500',
    chip: 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200',
    bar: 'border-l-2 border-rose-500 bg-rose-50 text-rose-700',
  },
}

// Page ---------------------------------------------------------------------

export function KelasCalendarSection() {
  const { user } = useAuth()
  const canManage = user?.role === 'admin' || user?.role === 'staff' || user?.role === 'pengurus' || user?.role === 'guru'
  const toast = useToast()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const { t, i18n } = useTranslation()
  const STATUS_LABEL: Record<Status, string> = {
    scheduled: t('kelasSection.status.scheduled'),
    ongoing: t('kelasSection.status.ongoing'),
    completed: t('kelasSection.status.completed'),
    missed: t('kelasSection.status.missed'),
  }
  // Locale-aware month + weekday names — rendered via Intl so they reflow on
  // language change. The structural constants (status colors) stay above.
  const BULAN = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(i18n.language, { month: 'long' })
    return Array.from({ length: 12 }, (_, i) => fmt.format(new Date(2000, i, 1)))
  }, [i18n.language])
  const HARI = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(i18n.language, { weekday: 'short' })
    // Days that fall on Sun..Sat (2000-01-02 was a Sunday).
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2000, 0, 2 + i)))
  }, [i18n.language])

  const today = useMemo(() => new Date(), [])
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  // Jenjang filter — caberawit (PAUD/TK/SD), remaja (SMP/SMA), pra-nikah
  // (dewasa). Derived from the tingkat name; empty = semua jenjang.
  const [jenjang, setJenjang] = useState<'' | 'caberawit' | 'remaja' | 'pra-nikah'>('')
  // Kelas scope — 'mine' = only kelas where current user is the guru.
  const [kelasMode, setKelasMode] = useState<'all' | 'mine'>('all')
  const [pickedDate, setPickedDate] = useState<string | null>(null)
  const [editing, setEditing] = useState<Sesi | null>(null)
  const [creatingFor, setCreatingFor] = useState<string | null>(null)
  // Filter: when set, only sesi of this kelas show in the calendar grid.
  // Also feeds defaults.kelasId when the user adds a sesi from a day.
  const [kelasFilter, setKelasFilter] = useState<string>('')
  const [rescheduling, setRescheduling] = useState<Sesi | null>(null)

  const isoFrom = useMemo(() => localDate(new Date(year, month, 1)), [year, month])
  const isoTo = useMemo(() => localDate(new Date(year, month + 1, 0)), [year, month])

  const { data: tingkatList = [] } = useQuery({
    queryKey: ['tingkat'],
    queryFn: listTingkat,
    staleTime: 5 * 60_000,
  })
  void tingkatList // kept for query coalescing with other tabs

  const { data: kelasList = [] } = useQuery({
    queryKey: ['kelas'],
    queryFn: () => listKelas({}),
    staleTime: 60_000,
  })
  const kelasNameById = useMemo(() => {
    const m: Record<string, string> = {}
    for (const k of kelasList) m[k.id] = k.nama
    return m
  }, [kelasList])

  // Map kelasId → "mine"? Sesi reference kelasId, so we filter against that.
  const myKelasIds = useMemo(
    () =>
      new Set(
        kelasList
          .filter((k) => user?.id && (k.guruUserIds ?? []).includes(user.id))
          .map((k) => k.id),
      ),
    [kelasList, user?.id],
  )

  const { data: sesiList = [], isFetching } = useQuery({
    queryKey: ['sesi', { from: isoFrom, to: isoTo }],
    queryFn: () => listSesi({ from: isoFrom, to: isoTo }),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['sesi'] })

  const deleteMut = useMutation({
    mutationFn: deleteSesi,
    onSuccess: () => {
      toast(t('kelasSection.calendar.sesiDeleted'), 'success')
      invalidate()
    },
    onError: (e) => toast(apiMsg(e, t('kelasSection.calendar.sesiDeleteFailed')), 'error'),
  })

  const startMut = useMutation({
    mutationFn: startSesi,
    onSuccess: () => {
      toast(t('kelasSection.calendar.sesiStarted'), 'success')
      invalidate()
    },
    onError: (e) => toast(apiMsg(e, t('kelasSection.calendar.sesiStartFailed')), 'error'),
  })

  const [endingSesi, setEndingSesi] = useState<Sesi | null>(null)
  const [reviewingSesi, setReviewingSesi] = useState<Sesi | null>(null)

  // Client-side filter — apply jenjang + kelasMode + kelasFilter after
  // fetching the month.
  const filteredSesi = useMemo(() => {
    return sesiList.filter((s) => {
      if (jenjang && tingkatToJenjang(s.tingkat ?? '') !== jenjang) return false
      if (kelasMode === 'mine') {
        if (!s.kelasId || !myKelasIds.has(s.kelasId)) return false
      }
      if (kelasFilter && s.kelasId !== kelasFilter) return false
      return true
    })
  }, [sesiList, jenjang, kelasMode, myKelasIds, kelasFilter])

  const byDate = useMemo(() => {
    const m: Record<string, Sesi[]> = {}
    for (const s of filteredSesi) {
      const k = (s.tanggal || '').slice(0, 10)
      ;(m[k] ||= []).push(s)
    }
    return m
  }, [filteredSesi])

  const grid = useMemo(() => {
    const first = new Date(year, month, 1)
    const startOffset = first.getDay()
    const start = new Date(year, month, 1 - startOffset)
    const cells: { date: Date; iso: string; inMonth: boolean }[] = []
    for (let i = 0; i < 42; i++) {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      cells.push({ date: d, iso: localDate(d), inMonth: d.getMonth() === month })
    }
    return cells
  }, [year, month])

  function navMonth(delta: number) {
    let m = month + delta
    let y = year
    if (m < 0) {
      m = 11
      y -= 1
    }
    if (m > 11) {
      m = 0
      y += 1
    }
    setYear(y)
    setMonth(m)
  }

  function goToday() {
    setYear(today.getFullYear())
    setMonth(today.getMonth())
    setPickedDate(localDate(today))
  }

  function gotoDate(iso: string) {
    setPickedDate(iso)
    const d = new Date(iso)
    if (isNaN(d.getTime())) return
    if (d.getFullYear() !== year || d.getMonth() !== month) {
      setYear(d.getFullYear())
      setMonth(d.getMonth())
    }
  }

  useEffect(() => {
    if (!pickedDate || creatingFor || editing) return
    const cur = pickedDate
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null
      const tag = el?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (el?.isContentEditable)) return
      let delta: number | null = null
      switch (e.key) {
        case 'ArrowLeft':
          delta = -1
          break
        case 'ArrowRight':
          delta = +1
          break
        case 'ArrowUp':
          delta = -7
          break
        case 'ArrowDown':
          delta = +7
          break
        case 'Escape':
          e.preventDefault()
          setPickedDate(null)
          return
        default:
          return
      }
      e.preventDefault()
      gotoDate(shiftDate(cur, delta))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedDate, creatingFor, editing])

  // Stats for the visible month
  const stats = useMemo(() => {
    const monthPrefix = `${year}-${pad2(month + 1)}`
    const inMonth = filteredSesi.filter((s) => (s.tanggal || '').startsWith(monthPrefix))
    const tally = { scheduled: 0, ongoing: 0, completed: 0, missed: 0 }
    for (const s of inMonth) tally[statusOf(s, today)] += 1
    return { total: inMonth.length, ...tally }
  }, [filteredSesi, year, month, today])

  const todayIso = localDate(today)
  const dayList = pickedDate ? byDate[pickedDate] || [] : []

  const handleDelete = async (s: Sesi) => {
    if (await confirm({ message: t('kelasSection.calendar.confirmDelete', { topik: s.topik }), danger: true })) {
      deleteMut.mutate(s.id)
    }
  }

  // Kelas filtered by jenjang + kelasMode — populates the "Pilih kelas"
  // FILTER dropdown options. When mode=mine they must include the current
  // user as guru.
  const pickableKelas = useMemo(() => {
    return kelasList.filter((k) => {
      if (jenjang && tingkatToJenjang(k.tingkat) !== jenjang) return false
      if (kelasMode === 'mine' && !(user?.id && (k.guruUserIds ?? []).includes(user.id))) return false
      return true
    })
  }, [kelasList, jenjang, kelasMode, user?.id])

  // The kelas filter's tingkat — used as defaultTingkat for the sesi form
  // so the materi picker stays bound to the kelas's age band.
  const filteredKelas = useMemo(
    () => kelasList.find((k) => k.id === kelasFilter) ?? null,
    [kelasList, kelasFilter],
  )

  return (
    <PageShell>
      <div className="space-y-4">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => navMonth(-1)} aria-label={t('kelasSection.calendar.prevMonth')}>
              <ChevronLeft size={16} />
            </Button>
            <div className="min-w-[180px] text-center text-base font-semibold">
              {BULAN[month]} {year}
            </div>
            <Button variant="ghost" size="sm" onClick={() => navMonth(1)} aria-label={t('kelasSection.calendar.nextMonth')}>
              <ChevronRight size={16} />
            </Button>
            <Button variant="ghost" size="sm" className="ml-2" onClick={goToday}>
              {t('kelasSection.calendar.today')}
            </Button>
          </div>
          {/* Mobile: 3-col grid so jenjang / kelas-mode / "+ Tambah sesi" share
              equal width and don't bleed. Desktop falls back to inline flex. */}
          <div
            className={
              'grid w-full min-w-0 gap-2 ' +
              (canManage ? 'grid-cols-3' : 'grid-cols-2') +
              ' sm:flex sm:w-auto sm:items-center'
            }
          >
            <select
              value={jenjang}
              onChange={(e) =>
                setJenjang(e.target.value as '' | 'caberawit' | 'remaja' | 'pra-nikah')
              }
              className="h-9 min-w-0 rounded-md border border-slate-300 bg-white px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 sm:px-3"
              aria-label={t('kelasSection.calendar.filterJenjang')}
              title={t('kelasSection.calendar.jenjangTitle')}
            >
              <option value="">{t('kelasSection.calendar.allJenjang')}</option>
              <option value="caberawit">{t('kelasSection.calendar.caberawit')}</option>
              <option value="remaja">{t('kelasSection.calendar.remaja')}</option>
              <option value="pra-nikah">{t('kelasSection.calendar.praNikah')}</option>
            </select>
            <select
              value={kelasMode}
              onChange={(e) => setKelasMode(e.target.value as 'all' | 'mine')}
              className="h-9 min-w-0 rounded-md border border-slate-300 bg-white px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 sm:px-3"
              aria-label={t('kelasSection.calendar.filterKelas')}
              title={t('kelasSection.calendar.scopeTitle')}
            >
              <option value="all">{t('kelasSection.calendar.allKelas')}</option>
              <option value="mine">{t('kelasSection.calendar.myKelas')}</option>
            </select>
            <select
              value={kelasFilter}
              onChange={(e) => setKelasFilter(e.target.value)}
              className="h-9 min-w-0 rounded-md border border-slate-300 bg-white px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 sm:px-3"
              aria-label={t('kelasSection.calendar.filterKelasPick')}
              title={t('kelasSection.calendar.pickKelasFilterTitle')}
            >
              <option value="">{t('kelasSection.calendar.allKelasFilter')}</option>
              {pickableKelas.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.nama} · {k.tingkat}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Stats — single row of 4 on every breakpoint (compact cards on mobile). */}
        <div className="grid grid-cols-4 gap-2 sm:gap-3">
          <StatCard label={t('kelasSection.calendar.monthTotal')} value={stats.total} sub={isFetching ? t('kelasSection.calendar.loadingSub') : `${BULAN[month]} ${year}`} />
          <StatCard label={STATUS_LABEL.completed} value={stats.completed} dot="bg-emerald-500" />
          <StatCard label={STATUS_LABEL.ongoing} value={stats.ongoing} dot="bg-amber-500" />
          <StatCard label={STATUS_LABEL.missed} value={stats.missed} dot="bg-rose-500" />
        </div>

        {/* Calendar */}
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {HARI.map((h, i) => (
              <div
                key={h}
                className={
                  'px-2 py-2 text-center ' +
                  (i === 0 ? 'text-rose-600' : i === 6 ? 'text-sky-600' : '')
                }
              >
                {h}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {grid.map((cell) => {
              const items = byDate[cell.iso] || []
              const isPicked = pickedDate === cell.iso
              const isToday = cell.iso === todayIso
              const dow = cell.date.getDay()
              return (
                <button
                  key={cell.iso}
                  type="button"
                  onClick={() => gotoDate(cell.iso)}
                  className={
                    'relative flex min-h-[88px] min-w-0 flex-col gap-1 overflow-hidden border-r border-t border-slate-200 px-1.5 py-1 text-left text-sm transition ' +
                    (cell.inMonth ? '' : 'bg-slate-50/50 text-slate-400 ') +
                    (isPicked ? 'bg-sky-50/70 ring-2 ring-inset ring-sky-400 ' : 'hover:bg-slate-50 ') +
                    (isToday ? 'outline outline-2 -outline-offset-2 outline-slate-900 ' : '')
                  }
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={
                        'text-xs ' +
                        (isToday ? 'font-bold ' : 'font-medium ') +
                        (dow === 0 && cell.inMonth ? 'text-rose-600' : '')
                      }
                    >
                      {cell.date.getDate()}
                    </span>
                    {items.length > 0 ? (
                      <span className="rounded-full bg-slate-200 px-1.5 text-[10px] font-medium text-slate-700">
                        {items.length}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {items.slice(0, 3).map((s) => {
                      const st = statusOf(s, today)
                      const knama = s.kelasId ? kelasNameById[s.kelasId] : null
                      return (
                        <span
                          key={s.id}
                          className={'truncate rounded px-1.5 py-0.5 text-[10px] leading-tight ' + STATUS_CLASSES[st].bar}
                        >
                          {s.mulai ? <span className="font-semibold">{s.mulai} </span> : null}
                          {knama ? <span className="font-medium">{knama} · </span> : null}
                          {s.topik}
                        </span>
                      )
                    })}
                    {items.length > 3 ? (
                      <span className="px-1.5 text-[10px] text-slate-500">{t('kelasSection.calendar.moreItems', { count: items.length - 3 })}</span>
                    ) : null}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
          {(['scheduled', 'ongoing', 'completed', 'missed'] as Status[]).map((st) => (
            <span key={st} className="inline-flex items-center gap-1.5">
              <span className={'inline-block h-2.5 w-2.5 rounded-sm ' + STATUS_CLASSES[st].dot} />
              {STATUS_LABEL[st]}
            </span>
          ))}
          <span>· {t('kelasSection.calendar.todayHighlight')}</span>
        </div>
      </div>

      {/* Day detail popup */}
      {pickedDate ? (
        <DayPopup
          iso={pickedDate}
          todayIso={todayIso}
          today={today}
          items={dayList}
          tingkatList={tingkatList.map((t) => t.nama)}
          kelasNameById={kelasNameById}
          canManage={canManage}
          onClose={() => setPickedDate(null)}
          onPrev={() => gotoDate(shiftDate(pickedDate, -1))}
          onNext={() => gotoDate(shiftDate(pickedDate, +1))}
          onAdd={() => setCreatingFor(pickedDate)}
          onEdit={(s) => setEditing(s)}
          onDelete={handleDelete}
          onStart={(s) => startMut.mutate(s.id)}
          onEnd={(s) => setEndingSesi(s)}
          onReschedule={(s) => setRescheduling(s)}
          onReview={(s) => setReviewingSesi(s)}
          deleting={deleteMut.isPending}
          starting={startMut.isPending}
          ending={false}
        />
      ) : null}

      {creatingFor ? (
        <SesiFormDialog
          mode="create"
          defaults={{
            defaultDate: creatingFor,
            // Defaults follow the "Pilih kelas" filter. When the filter is
            // empty (Semua kelas), the form's kelas picker stays empty
            // and the user MUST choose a kelas to save.
            kelasId: filteredKelas?.id,
            defaultTingkat: filteredKelas?.tingkat,
          }}
          onClose={() => setCreatingFor(null)}
          onSaved={() => {
            invalidate()
            setCreatingFor(null)
          }}
        />
      ) : null}

      {editing ? (
        <SesiFormDialog
          mode="edit"
          sesi={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            invalidate()
            setEditing(null)
          }}
        />
      ) : null}

      {rescheduling ? (
        <RescheduleSesiDialog
          sesi={rescheduling}
          tingkat={rescheduling.tingkat ?? undefined}
          onClose={() => setRescheduling(null)}
          onSaved={() => {
            invalidate()
            setRescheduling(null)
          }}
        />
      ) : null}

      {endingSesi ? (
        <EndSesiSummaryDialog
          sesi={endingSesi}
          onClose={() => setEndingSesi(null)}
          onEnded={() => {
            invalidate()
            setEndingSesi(null)
          }}
        />
      ) : null}

      {reviewingSesi ? (
        <EndSesiSummaryDialog
          sesi={reviewingSesi}
          onClose={() => setReviewingSesi(null)}
          onEnded={() => {
            invalidate()
            setReviewingSesi(null)
          }}
        />
      ) : null}
    </PageShell>
  )
}

// Stat card -----------------------------------------------------------------

function StatCard({
  label,
  value,
  sub,
  dot,
}: {
  label: string
  value: number
  sub?: string
  dot?: string
}) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-2 shadow-sm sm:p-4">
      <div className="flex items-start gap-1 text-[10px] uppercase leading-tight tracking-tight text-slate-500 sm:items-center sm:gap-2 sm:text-xs sm:tracking-wide">
        {dot ? (
          <span className={'mt-0.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full sm:mt-0 sm:h-2 sm:w-2 ' + dot} />
        ) : null}
        <span className="min-w-0">{label}</span>
      </div>
      <div className="mt-0.5 text-lg font-semibold leading-none text-slate-900 sm:mt-1 sm:text-2xl">{value}</div>
      {sub ? <div className="truncate text-[10px] text-slate-500 sm:text-xs">{sub}</div> : null}
    </div>
  )
}

// Day popup -----------------------------------------------------------------

function DayPopup({
  iso,
  todayIso,
  today,
  items,
  kelasNameById,
  canManage,
  onClose,
  onPrev,
  onNext,
  onAdd,
  onEdit,
  onDelete,
  onStart,
  onEnd,
  onReschedule,
  onReview,
  deleting,
  starting,
  ending,
}: {
  iso: string
  todayIso: string
  today: Date
  items: Sesi[]
  tingkatList: string[]
  kelasNameById: Record<string, string>
  canManage: boolean
  onClose: () => void
  onPrev: () => void
  onNext: () => void
  onAdd: () => void
  onEdit: (s: Sesi) => void
  onDelete: (s: Sesi) => void
  onStart: (s: Sesi) => void
  onEnd: (s: Sesi) => void
  onReschedule: (s: Sesi) => void
  onReview?: (s: Sesi) => void
  deleting: boolean
  starting: boolean
  ending: boolean
}) {
  const { t, i18n } = useTranslation()
  const STATUS_LABEL: Record<Status, string> = {
    scheduled: t('kelasSection.status.scheduled'),
    ongoing: t('kelasSection.status.ongoing'),
    completed: t('kelasSection.status.completed'),
    missed: t('kelasSection.status.missed'),
  }
  const date = new Date(iso)
  const label = isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString(i18n.language, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-2 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="my-2 flex w-full max-w-2xl flex-col rounded-lg bg-white shadow-xl sm:my-8" style={{ maxHeight: '85vh' }}>
        <div className="sticky top-0 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t('kelasSection.calendar.dateDetail')}</p>
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onPrev}
                className="rounded-md p-1 text-slate-600 hover:bg-slate-100"
                aria-label={t('kelasSection.calendar.prevDay')}
                title={t('kelasSection.calendar.prevDayTitle')}
              >
                <ChevronLeft size={16} />
              </button>
              <h3 className="text-base font-semibold">{label}</h3>
              <button
                type="button"
                onClick={onNext}
                className="rounded-md p-1 text-slate-600 hover:bg-slate-100"
                aria-label={t('kelasSection.calendar.nextDay')}
                title={t('kelasSection.calendar.nextDayTitle')}
              >
                <ChevronRight size={16} />
              </button>
              {iso === todayIso ? (
                <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-medium text-white">
                  {t('kelasSection.calendar.todayBadge')}
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {items.length === 0
                ? t('kelasSection.calendar.noSesiScheduled')
                : t('kelasSection.calendar.sesiCount', { count: items.length })}
              {' · '}{t('kelasSection.calendar.navHelp')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {canManage ? (
              <Button size="sm" onClick={onAdd}>
                <Plus size={14} className="mr-1" /> {t('kelasSection.calendar.addSesi')}
              </Button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              aria-label={t('kelasSection.calendar.close')}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {items.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">{t('kelasSection.calendar.noSesiThisDay')}</p>
          ) : (
            <ul className="space-y-2">
              {items.map((s) => {
                const st = statusOf(s, today)
                return (
                  <li key={s.id} className="flex items-start gap-3 rounded-md border border-slate-200 bg-white p-3">
                    <span className={'mt-1 inline-block h-2 w-2 rounded-full ' + STATUS_CLASSES[st].dot} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        {s.kelasId && kelasNameById[s.kelasId] ? (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-800">
                            🏫 {kelasNameById[s.kelasId]}
                          </span>
                        ) : null}
                        {s.tingkat ? <span className="font-medium text-slate-700">{s.tingkat}</span> : null}
                        {s.mulai ? (
                          <span>
                            {s.mulai}
                            {s.selesai ? `–${s.selesai}` : ''}
                          </span>
                        ) : null}
                        <span className={'rounded-full px-2 py-0.5 ' + STATUS_CLASSES[st].chip}>
                          {STATUS_LABEL[st]}
                        </span>
                      </div>
                      {s.endedAt ? (
                        <button
                          type="button"
                          onClick={() => onReview?.(s)}
                          className="mt-0.5 break-words text-left text-sm font-medium text-slate-900 underline decoration-dotted underline-offset-2 hover:opacity-75"
                          title={t('kelasSection.calendar.reviewSummary')}
                        >
                          {s.topik}
                        </button>
                      ) : (
                        <div className="mt-0.5 break-words text-sm font-medium text-slate-900">{s.topik}</div>
                      )}
                      {s.catatan ? (
                        <div className="mt-1 break-words text-xs text-slate-600">{s.catatan}</div>
                      ) : null}
                    </div>
                    {canManage ? (
                      <div className="flex items-center gap-1">
                        {!s.startedAt ? (
                          <button
                            type="button"
                            onClick={() => onStart(s)}
                            disabled={starting}
                            className="rounded-md p-1.5 text-slate-500 transition hover:bg-amber-50 hover:text-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                            aria-label={t('kelasSection.calendar.startSesi')}
                            title={t('kelasSection.calendar.startSesi')}
                          >
                            <Play size={16} />
                          </button>
                        ) : !s.endedAt ? (
                          <>
                            <Link
                              to={`/kelas/${s.kelasId ?? ''}/sesi/${s.id}/live`}
                              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                              aria-label={t('kelasSection.calendar.liveStage')}
                              title={t('kelasSection.calendar.openLive')}
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
                              onClick={() => onEnd(s)}
                              disabled={ending}
                              className="rounded-md p-1.5 text-slate-500 transition hover:bg-emerald-50 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                              aria-label={t('kelasSection.calendar.endSesi')}
                              title={t('kelasSection.calendar.endSesi')}
                            >
                              <Square size={16} />
                            </button>
                          </>
                        ) : null}
                        {!s.endedAt ? (
                          <button
                            type="button"
                            onClick={() => onReschedule(s)}
                            className="rounded-md p-1.5 text-slate-500 transition hover:bg-sky-50 hover:text-sky-700"
                            aria-label={t('kelasSection.calendar.reschedule')}
                            title={t('kelasSection.calendar.reschedule')}
                          >
                            <RotateCcw size={16} />
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => onEdit(s)}
                          className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                          aria-label={t('common.edit')}
                          title={t('common.edit')}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(s)}
                          disabled={deleting}
                          className="rounded-md p-1.5 text-slate-500 transition hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label={t('common.delete')}
                          title={t('common.delete')}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

function apiMsg(e: unknown, fallback: string) {
  if (e instanceof ApiError) return e.message || fallback
  return fallback
}

// Map a tingkat name (e.g. "SD-3", "SMP-1", "Pra-nikah") to its jenjang
// grouping. Returns null when no mapping is known so unfiltered semantics
// hide rows the user didn't explicitly opt-in to filter out.
function tingkatToJenjang(t: string): 'caberawit' | 'remaja' | 'pra-nikah' | null {
  const T = (t || '').toUpperCase()
  if (!T) return null
  if (T.startsWith('PAUD') || T.startsWith('TK') || T.startsWith('SD')) return 'caberawit'
  if (T.startsWith('SMP') || T.startsWith('SMA') || T.startsWith('SMK')) return 'remaja'
  if (
    T.includes('PRA-NIKAH') ||
    T.includes('PRA NIKAH') ||
    T.includes('PRANIKAH') ||
    T.includes('DEWASA') ||
    T.includes('USIA NIKAH')
  ) return 'pra-nikah'
  return null
}
