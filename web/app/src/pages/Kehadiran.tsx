import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CalendarDays, Clock, Sparkles, Users } from 'lucide-react'
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import {
  getAttendanceStats,
  listAttendances,
  type AttendanceStatus,
} from '@/api/attendances'
import { Input } from '@/components/Input'
import { PageShell, PageHeader } from '@/components/PageShell'
import { cn } from '@/lib/cn'

/**
 * Kehadiran — punya 2 tab. "Analitik" merangkum stats (KpiCard + chart +
 * tabel agregat per generus/pengajar). "Daftar Absen" menyajikan log raw
 * paginasi baik dari data import historis maupun row attendance baru yang
 * dibuat setiap sesi live diakhiri.
 */

type Tab = 'analitik' | 'daftar'

const STATUS_KEYS: AttendanceStatus[] = ['hadir', 'izin_murid', 'izin_guru', 'by_vn', 'alfa']
function statusLabelKey(s: AttendanceStatus) {
  return `kehadiran.status.${s}` as const
}

export function KehadiranPage() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('analitik')

  return (
    <PageShell
      header={
        <PageHeader
          title={t('kehadiran.title')}
          subtitle={t('kehadiran.subtitle')}
        />
      }
    >
      <div className="mb-4 flex gap-1 rounded-md border border-slate-200 bg-slate-50 p-1">
        <TabBtn active={tab === 'analitik'} onClick={() => setTab('analitik')}>
          {t('kehadiran.tabAnalitik')}
        </TabBtn>
        <TabBtn active={tab === 'daftar'} onClick={() => setTab('daftar')}>
          {t('kehadiran.tabDaftar')}
        </TabBtn>
      </div>

      {tab === 'analitik' ? <AnalitikTab /> : <DaftarAbsenTab />}
    </PageShell>
  )
}

function TabBtn({
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
        'flex-1 rounded px-3 py-1.5 text-sm font-medium transition',
        active
          ? 'bg-white text-slate-900 shadow-sm'
          : 'text-slate-600 hover:text-slate-900',
      )}
    >
      {children}
    </button>
  )
}

// -----------------------------------------------------------------------
// Analitik

type RangePreset = 'all' | 'thisYear' | 'thisMonth' | number

const STATUS_COLOR: Record<AttendanceStatus, string> = {
  hadir: '#10b981',
  izin_murid: '#3b82f6',
  izin_guru: '#f97316',
  by_vn: '#0ea5e9',
  alfa: '#ef4444',
}

function AnalitikTab() {
  const { t, i18n } = useTranslation()
  const today = new Date()
  const [preset, setPreset] = useState<RangePreset>('all')

  const { dateFrom, dateTo, label } = useMemo(() => {
    if (preset === 'all') return { dateFrom: undefined, dateTo: undefined, label: t('kehadiran.allYears') }
    if (preset === 'thisYear') {
      const y = today.getFullYear()
      return { dateFrom: `${y}-01-01`, dateTo: `${y}-12-31`, label: String(y) }
    }
    if (preset === 'thisMonth') {
      const y = today.getFullYear()
      const m = String(today.getMonth() + 1).padStart(2, '0')
      const last = new Date(y, today.getMonth() + 1, 0).getDate()
      return {
        dateFrom: `${y}-${m}-01`,
        dateTo: `${y}-${m}-${String(last).padStart(2, '0')}`,
        label: `${y}-${m}`,
      }
    }
    return {
      dateFrom: `${preset}-01-01`,
      dateTo: `${preset}-12-31`,
      label: String(preset),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, i18n.language])

  const { data: stats } = useQuery({
    queryKey: ['attendance-stats', dateFrom, dateTo],
    queryFn: () => getAttendanceStats({ dateFrom, dateTo }),
  })

  const years = useMemo(() => {
    const cur = today.getFullYear()
    // Bound the year chips to a sensible recent window so an orphan /
    // sentinel-dated record (e.g. a stray 2005 from a bad import) doesn't
    // add a misleading year filter. Current + two prior years are always
    // shown; older real years appear only within the lookback window.
    const minYear = cur - 6
    const set = new Set<number>(
      (stats?.availableYears ?? []).filter((y) => y >= minYear),
    )
    set.add(cur)
    set.add(cur - 1)
    set.add(cur - 2)
    return Array.from(set).sort((a, b) => b - a)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats?.availableYears])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          {t('kehadiran.rangeLabel')}
        </span>
        <FilterChip active={preset === 'all'} onClick={() => setPreset('all')}>
          {t('kehadiran.allShort')}
        </FilterChip>
        <FilterChip active={preset === 'thisYear'} onClick={() => setPreset('thisYear')}>
          {t('kehadiran.thisYear')}
        </FilterChip>
        <FilterChip active={preset === 'thisMonth'} onClick={() => setPreset('thisMonth')}>
          {t('kehadiran.thisMonth')}
        </FilterChip>
        {years.map((y) => (
          <FilterChip key={y} active={preset === y} onClick={() => setPreset(y)}>
            {y}
          </FilterChip>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          icon={<CalendarDays size={18} />}
          label={t('kehadiran.kpiTotalSesi')}
          value={fmt(stats?.total.sessions ?? 0, i18n.language)}
          sub={label}
        />
        <KpiCard
          icon={<Clock size={18} />}
          label={t('kehadiran.kpiTotalJam')}
          value={t('kehadiran.hoursValue', { count: Math.round(stats?.total.hours ?? 0) })}
          sub={label}
        />
        <KpiCard
          icon={<Sparkles size={18} />}
          label={t('kehadiran.kpi30Days')}
          value={fmt(stats?.total.last30Days ?? 0, i18n.language)}
          sub={t('kehadiran.kpi30DaysSub')}
        />
        <KpiCard
          icon={<Users size={18} />}
          label={t('kehadiran.kpiActivePairs')}
          value={fmt(stats?.total.activePairs ?? 0, i18n.language)}
          sub={t('kehadiran.kpiActivePairsSub')}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
          <div className="mb-2 text-sm font-semibold text-slate-800">{t('kehadiran.sesiPerBulan')}</div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={stats?.monthly ?? []}
                margin={{ top: 5, right: 12, bottom: 5, left: 0 }}
              >
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" allowDecimals={false} />
                <Tooltip
                  cursor={{ stroke: '#cbd5e1', strokeWidth: 1 }}
                  contentStyle={{ borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12 }}
                />
                <Line
                  type="monotone"
                  dataKey="sessions"
                  stroke="#0f172a"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-2 text-sm font-semibold text-slate-800">{t('kehadiran.distStatus')}</div>
          <StatusDonut buckets={stats?.byStatus ?? []} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-800">
            {t('kehadiran.perGenerus')}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">{t('kehadiran.col.nama')}</th>
                  <th className="px-3 py-2 text-right">{t('kehadiran.col.sesi')}</th>
                  <th className="px-3 py-2 text-right">{t('kehadiran.col.pctHadir')}</th>
                  <th className="px-3 py-2 text-right">{t('kehadiran.col.jam')}</th>
                  <th className="px-3 py-2 text-right">{t('kehadiran.col.lastSesi')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(stats?.byStudent ?? []).slice(0, 30).map((s) => (
                  <tr key={s.studentId} className="hover:bg-slate-50">
                    <td className="truncate px-3 py-2 font-medium text-slate-900">{s.studentName}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.totalSessions}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{Math.round(s.hadirRate)}%</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.totalHours.toFixed(1)}</td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums text-slate-500">
                      {s.lastDate?.slice(0, 10) ?? '—'}
                    </td>
                  </tr>
                ))}
                {(stats?.byStudent ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-xs text-slate-500">
                      {t('common.noData')}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-800">
            {t('kehadiran.perPengajar')}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">{t('kehadiran.col.nama')}</th>
                  <th className="px-3 py-2 text-right">{t('kehadiran.col.sesi')}</th>
                  <th className="px-3 py-2 text-right">{t('kehadiran.col.jam')}</th>
                  <th className="px-3 py-2 text-right">{t('kehadiran.col.numGenerus')}</th>
                  <th className="px-3 py-2 text-right">{t('kehadiran.col.lastSesi')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(stats?.byTeacher ?? []).slice(0, 30).map((tch) => (
                  <tr key={tch.teacherId} className="hover:bg-slate-50">
                    <td className="truncate px-3 py-2 font-medium text-slate-900">{tch.teacherName}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{tch.totalSessions}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{tch.totalHours.toFixed(1)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{tch.uniqueStudents}</td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums text-slate-500">
                      {tch.lastDate?.slice(0, 10) ?? '—'}
                    </td>
                  </tr>
                ))}
                {(stats?.byTeacher ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-xs text-slate-500">
                      {t('common.noData')}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------
// Daftar Absen

const STATUS_BADGE: Record<AttendanceStatus, string> = {
  hadir: 'bg-emerald-100 text-emerald-700',
  izin_murid: 'bg-sky-100 text-sky-700',
  izin_guru: 'bg-orange-100 text-orange-700',
  by_vn: 'bg-cyan-100 text-cyan-700',
  alfa: 'bg-rose-100 text-rose-700',
}

const PAGE_SIZE = 50

function DaftarAbsenTab() {
  const { t, i18n } = useTranslation()
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [status, setStatus] = useState<AttendanceStatus | ''>('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)

  const { data, isPending } = useQuery({
    queryKey: ['attendances-list', dateFrom, dateTo, status, page],
    queryFn: () =>
      listAttendances({
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        status: status || undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
  })
  const items = data?.items ?? []
  const total = data?.total ?? 0

  // Search is client-side (filters within the loaded page) — keeps the
  // server contract simple while letting the user narrow visually.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (it) =>
        it.studentName.toLowerCase().includes(q) ||
        it.teacherName.toLowerCase().includes(q) ||
        (it.materi ?? '').toLowerCase().includes(q),
    )
  }, [items, query])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {t('kehadiran.dateFrom')}
            </label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value)
                setPage(0)
              }}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {t('kehadiran.dateTo')}
            </label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value)
                setPage(0)
              }}
            />
          </div>
          <div className="flex flex-col gap-1" style={{ minWidth: 180 }}>
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {t('kehadiran.statusLabel')}
            </label>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as AttendanceStatus | '')
                setPage(0)
              }}
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            >
              <option value="">{t('kehadiran.allStatus')}</option>
              {STATUS_KEYS.map((s) => (
                <option key={s} value={s}>
                  {t(statusLabelKey(s))}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-1 flex-col gap-1" style={{ minWidth: 200 }}>
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {t('kehadiran.searchLabel')}
            </label>
            <Input
              placeholder={t('kehadiran.searchPh')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          {isPending
            ? t('common.loading')
            : t('kehadiran.recordsPage', {
                count: total,
                page: page + 1,
                total: totalPages,
                countFmt: fmt(total, i18n.language),
                totalFmt: fmt(totalPages, i18n.language),
              })}
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-[10px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">{t('kehadiran.col.date')}</th>
                <th className="px-3 py-2">{t('nav.students')}</th>
                <th className="px-3 py-2">{t('nav.teachers')}</th>
                <th className="px-3 py-2">{t('kehadiran.statusLabel')}</th>
                <th className="px-3 py-2 text-right">{t('kehadiran.col.duration')}</th>
                <th className="px-3 py-2">{t('kehadiran.col.materi')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((it) => (
                <tr key={it.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-700">
                    {it.date.slice(0, 10)}
                  </td>
                  <td className="px-3 py-2 font-medium text-slate-900">{it.studentName}</td>
                  <td className="px-3 py-2 text-slate-700">{it.teacherName}</td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        'inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold',
                        STATUS_BADGE[it.status],
                      )}
                    >
                      {t(statusLabelKey(it.status))}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                    {it.durationMin != null ? `${it.durationMin} m` : '—'}
                  </td>
                  <td className="max-w-[28ch] truncate px-3 py-2 text-xs text-slate-500" title={it.materi ?? ''}>
                    {it.materi || '—'}
                  </td>
                </tr>
              ))}
              {!isPending && filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-sm text-slate-500">
                    {t('kehadiran.noRecords')}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {totalPages > 1 ? (
          <div className="flex items-center justify-between border-t border-slate-200 px-3 py-2 text-xs">
            <span className="text-slate-500">
              {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)}{' '}
              {t('kehadiran.outOf', { total: fmt(total, i18n.language) })}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="rounded-md border border-slate-300 px-2 py-1 text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
              >
                ← {t('common.previous')}
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page + 1 >= totalPages}
                className="rounded-md border border-slate-300 px-2 py-1 text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
              >
                {t('common.next')} →
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------
// Shared bits

function FilterChip({
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
        'rounded-full border px-3 py-1 text-xs font-medium transition',
        active
          ? 'border-slate-900 bg-slate-900 text-white'
          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100',
      )}
    >
      {children}
    </button>
  )
}

function KpiCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-slate-600">
        <span className="rounded-md bg-slate-100 p-1.5">{icon}</span>
        <span className="text-xs">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-slate-500">{sub}</p> : null}
    </div>
  )
}

function StatusDonut({ buckets }: { buckets: { label: string; count: number }[] }) {
  const { t } = useTranslation()
  const data = buckets
    .filter((b) => b.count > 0)
    .map((b) => ({
      name: STATUS_KEYS.includes(b.label as AttendanceStatus)
        ? t(statusLabelKey(b.label as AttendanceStatus))
        : b.label,
      key: b.label,
      value: b.count,
    }))
  const total = data.reduce((a, b) => a + b.value, 0)
  if (total === 0) {
    return <p className="py-12 text-center text-xs text-slate-500">{t('kehadiran.noDataRange')}</p>
  }
  return (
    <div className="flex items-center gap-4">
      <div className="h-40 w-40 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={40}
              outerRadius={70}
              paddingAngle={2}
              stroke="none"
            >
              {data.map((d) => (
                <Cell key={d.key} fill={STATUS_COLOR[d.key as AttendanceStatus] ?? '#94a3b8'} />
              ))}
            </Pie>
            <Tooltip
              formatter={(v: number) => `${v} (${Math.round((v / total) * 100)}%)`}
              contentStyle={{ borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12 }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="grid flex-1 grid-cols-1 gap-y-1.5 text-xs">
        {STATUS_KEYS.map((s) => {
          const b = buckets.find((x) => x.label === s)
          return (
            <li key={s} className="flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: STATUS_COLOR[s] }}
              />
              <span className="flex-1 text-slate-700">{t(statusLabelKey(s))}</span>
              <span className="tabular-nums font-medium text-slate-900">{b?.count ?? 0}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function fmt(n: number, lang: string): string {
  return n.toLocaleString(lang.startsWith('en') ? 'en-US' : 'id-ID')
}
