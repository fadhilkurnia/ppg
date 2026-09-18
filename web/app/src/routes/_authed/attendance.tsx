import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
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
import { CalendarCheck, Clock, Users, Sparkles } from 'lucide-react'
import { z } from 'zod'

import {
  getAttendanceStats,
  type StudentAggregate,
  type TeacherAggregate,
} from '@/api/stats'
import { type AttendanceStatus } from '@/api/types'
import { cn } from '@/lib/cn'
import { useAttendanceStatusLabel, useTranslation } from '@/lib/i18n'

const searchSchema = z.object({
  range: z.string().optional().catch(undefined),
})

export const Route = createFileRoute('/_authed/attendance')({
  validateSearch: searchSchema,
  component: AttendanceStatsPage,
})

/**
 * Resolve a `range` token into ISO `dateFrom`/`dateTo` strings, plus a
 * `key` (and `year` for year tokens) so the component can render a
 * translated label. `all` (or any unknown token) returns undefined bounds
 * so the API sees no date filter.
 */
function resolveRange(token: string | undefined, today = new Date()) {
  const yyyy = today.getFullYear()
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  const dd = String(today.getDate()).padStart(2, '0')
  const todayIso = `${yyyy}-${mm}-${dd}`

  if (token === 'ytd') {
    return { dateFrom: `${yyyy}-01-01`, dateTo: todayIso, key: 'ytd' as const }
  }
  if (token === 'mtd') {
    return { dateFrom: `${yyyy}-${mm}-01`, dateTo: todayIso, key: 'mtd' as const }
  }
  // Numeric year, e.g. "2024"
  if (token && /^\d{4}$/.test(token)) {
    return {
      dateFrom: `${token}-01-01`,
      dateTo: `${token}-12-31`,
      key: 'year' as const,
      year: token,
    }
  }
  return { dateFrom: undefined, dateTo: undefined, key: 'all' as const }
}

const STATUS_COLORS: Record<AttendanceStatus, string> = {
  hadir: '#10b981',        // emerald-500
  izin_murid: '#f59e0b',   // amber-500
  izin_guru: '#f97316',    // orange-500
  by_vn: '#0ea5e9',        // sky-500
}

function AttendanceStatsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate({ from: '/attendance' })
  const { range } = Route.useSearch()
  const resolved = useMemo(() => resolveRange(range), [range])
  const rangeLabel =
    resolved.key === 'ytd'
      ? t('attendanceStats.rangeYtd')
      : resolved.key === 'mtd'
        ? t('attendanceStats.rangeMtd')
        : resolved.key === 'year'
          ? resolved.year
          : t('attendanceStats.rangeAll')

  const { data, isPending, isError } = useQuery({
    queryKey: ['stats', 'attendance', resolved.dateFrom ?? null, resolved.dateTo ?? null],
    queryFn: () =>
      getAttendanceStats({ dateFrom: resolved.dateFrom, dateTo: resolved.dateTo }),
    staleTime: 60_000,
  })

  if (isError) return <p className="text-red-600">{t('attendanceStats.loadError')}</p>
  if (isPending || !data) return <p className="text-slate-500">{t('common.loading')}</p>

  const activeToken = range ?? 'all'
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('attendanceStats.heading')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('attendanceStats.intro')}</p>
      </div>

      <RangeFilter
        active={activeToken}
        availableYears={data.availableYears}
        onChange={(token) =>
          void navigate({ search: { range: token === 'all' ? undefined : token } })
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard
          icon={<CalendarCheck size={20} />}
          label={t('attendanceStats.totalSessions')}
          value={data.total.sessions.toLocaleString('id-ID')}
          subtitle={rangeLabel}
        />
        <KPICard
          icon={<Clock size={20} />}
          label={t('attendanceStats.totalHours')}
          value={t('attendanceStats.hoursUnit', {
            n: data.total.hours.toFixed(0).toLocaleString(),
          })}
          subtitle={rangeLabel}
        />
        <KPICard
          icon={<Sparkles size={20} />}
          label={t('attendanceStats.last30')}
          value={data.total.last30Days.toLocaleString('id-ID')}
          subtitle={t('attendanceStats.last30Note')}
        />
        <KPICard
          icon={<Users size={20} />}
          label={t('attendanceStats.activePairs')}
          value={data.total.activePairs.toLocaleString('id-ID')}
          subtitle={t('attendanceStats.activePairsNote')}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title={t('attendanceStats.monthly')} className="lg:col-span-2">
          <MonthlyChart data={data.monthly} />
        </ChartCard>
        <ChartCard title={t('attendanceStats.distribution')}>
          <StatusDonut buckets={data.byStatus} total={data.total.sessions} />
        </ChartCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title={t('attendanceStats.perStudent')}>
          <StudentTable rows={data.byStudent} />
        </ChartCard>
        <ChartCard title={t('attendanceStats.perTeacher')}>
          <TeacherTable rows={data.byTeacher} />
        </ChartCard>
      </div>
    </div>
  )
}

/* --- KPI card --- */

function KPICard({
  icon,
  label,
  value,
  subtitle,
}: {
  icon: React.ReactNode
  label: string
  value: string | number
  subtitle?: string
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-3 text-slate-600 dark:text-slate-400">
        <span className="rounded-md bg-slate-100 p-2 dark:bg-slate-800">{icon}</span>
        <span className="text-sm">{label}</span>
      </div>
      <p className="mt-3 text-3xl font-semibold text-slate-900 dark:text-slate-100">{value}</p>
      {subtitle ? <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p> : null}
    </div>
  )
}

function ChartCard({
  title,
  children,
  className,
}: {
  title: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`min-w-0 max-w-full overflow-hidden rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 ${className ?? ''}`}>
      <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</h2>
      {children}
    </div>
  )
}

/* --- monthly trend chart --- */

function formatMonthTick(mStr: string) {
  try {
    const parts = mStr.split('-')
    if (parts.length === 2) {
      const yrShort = parts[0].slice(-2)
      const moIdx = parseInt(parts[1], 10) - 1
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
      const mo = months[moIdx] || parts[1]
      return `${mo} '${yrShort}`
    }
    return mStr
  } catch {
    return mStr
  }
}

function MonthlyChart({ data }: { data: { month: string; sessions: number; hours: number }[] }) {
  const { t } = useTranslation()
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const scrollToLatest = () => {
      el.scrollLeft = el.scrollWidth - el.clientWidth
    }
    scrollToLatest()
    const timer = setTimeout(scrollToLatest, 60)
    return () => clearTimeout(timer)
  }, [data])

  const totalSessions = data.reduce((acc, d) => acc + d.sessions, 0)

  const { yMax, yTicks } = useMemo(() => {
    const maxVal = Math.max(...data.map((d) => d.sessions), 0)
    let upper = maxVal === 0 ? 4 : Math.ceil(maxVal * 1.15)
    if (upper < 4) upper = 4
    const step = Math.ceil(upper / 4)
    const finalMax = step * 4
    const ticks = [0, step, step * 2, step * 3, finalMax]
    return { yMax: finalMax, yTicks: ticks }
  }, [data])

  if (data.length === 0 || totalSessions === 0) {
    return <p className="text-sm text-slate-500">{t('attendanceStats.monthlyEmpty')}</p>
  }

  const Y_AXIS_WIDTH = 32
  const calculatedWidth = Math.max(data.length * 52, 0)

  return (
    <div className="relative w-full min-w-0 max-w-full h-[260px]">
      {/* 1. Stationary Base: Fixed Y-Axis & Horizontal Grid Lines spanning 100% of the card */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <ResponsiveContainer width="100%" height={260}>
          <LineChart
            data={data}
            margin={{ top: 12, right: 12, bottom: 24, left: 0 }}
          >
            <CartesianGrid
              stroke="#e2e8f0"
              strokeDasharray="3 3"
              className="stroke-slate-200 dark:stroke-slate-800"
              vertical={false}
            />
            <YAxis
              stroke="#64748b"
              fontSize={10}
              allowDecimals={false}
              width={Y_AXIS_WIDTH}
              domain={[0, yMax]}
              ticks={yTicks}
              tickMargin={3}
              axisLine={false}
              className="dark:[&_text]:fill-slate-400"
            />
            <XAxis dataKey="month" hide height={0} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* 2. Scrollable Foreground: Line, X-Axis dates, and Tooltip */}
      <div
        ref={scrollRef}
        className="absolute top-0 bottom-0 right-0 overflow-x-auto overflow-y-hidden custom-scrollbar touch-pan-x z-10 border-l border-slate-200 dark:border-slate-800"
        style={{
          left: Y_AXIS_WIDTH,
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <div style={{ width: calculatedWidth, minWidth: '100%', height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{ top: 12, right: 12, bottom: 0, left: 0 }}
            >
              <YAxis
                hide
                width={0}
                domain={[0, yMax]}
                ticks={yTicks}
              />
              <XAxis
                dataKey="month"
                height={24}
                stroke="#64748b"
                fontSize={10}
                tickMargin={4}
                interval={0}
                tickFormatter={formatMonthTick}
                axisLine={{ stroke: '#cbd5e1' }}
                className="dark:[&_line]:stroke-slate-700 dark:[&_text]:fill-slate-400"
              />
              <Tooltip
                formatter={(v: number, k: string) =>
                  k === 'hours'
                    ? [t('attendanceStats.hoursUnit', { n: v.toFixed(1) }), t('attendanceStats.hoursTooltip')]
                    : [v, t('attendanceStats.sessionsTooltip')]
                }
                labelFormatter={(label) => t('attendanceStats.monthLabel', { label: String(label) })}
              />
              <Line
                type="monotone"
                dataKey="sessions"
                stroke="#4f46e5"
                strokeWidth={2.5}
                dot={{ r: 3.5, fill: '#4f46e5' }}
                activeDot={{ r: 5.5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

/* --- status donut --- */

function StatusDonut({
  buckets,
  total,
}: {
  buckets: { label: string; count: number }[]
  total: number
}) {
  const { t } = useTranslation()
  const statusLabel = useAttendanceStatusLabel()
  const data = buckets
    .filter((b) => b.count > 0)
    .map((b) => ({
      name: statusLabel(b.label, b.label),
      key: b.label as AttendanceStatus,
      value: b.count,
    }))
  if (data.length === 0) {
    return <p className="text-sm text-slate-500">{t('attendanceStats.monthlyEmpty')}</p>
  }
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="h-40 w-40 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={42}
              outerRadius={70}
              paddingAngle={2}
              stroke="none"
            >
              {data.map((d) => (
                <Cell key={d.key} fill={STATUS_COLORS[d.key]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(v: number) => `${v.toLocaleString('id-ID')} (${total ? ((v / total) * 100).toFixed(1) : 0}%)`}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="grid w-full grid-cols-2 gap-x-3 gap-y-2 text-sm">
        {buckets.map((b) => (
          <li key={b.label} className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: STATUS_COLORS[b.label as AttendanceStatus] }}
            />
            <span className="truncate font-medium">{statusLabel(b.label, b.label)}</span>
            <span className="ml-auto text-slate-500">{b.count.toLocaleString('id-ID')}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* --- sortable tables --- */

type StudentSortKey = 'totalSessions' | 'hadirRate' | 'totalHours'
type TeacherSortKey = 'totalSessions' | 'totalHours' | 'uniqueStudents'

function StudentTable({ rows }: { rows: StudentAggregate[] }) {
  const { t } = useTranslation()
  const [sortKey, setSortKey] = useState<StudentSortKey>('totalSessions')
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')

  const sorted = useMemo(() => {
    const out = [...rows]
    out.sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      return dir === 'asc' ? av - bv : bv - av
    })
    return out
  }, [rows, sortKey, dir])

  const setSort = (k: StudentSortKey) => {
    if (k === sortKey) setDir(dir === 'asc' ? 'desc' : 'asc')
    else {
      setSortKey(k)
      setDir('desc')
    }
  }

  return (
    <div className="max-h-96 overflow-auto rounded-md border border-slate-200">
      <table className="min-w-full text-sm">
        <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2">{t('attendanceStats.colName')}</th>
            <SortHeader active={sortKey === 'totalSessions'} dir={dir} onClick={() => setSort('totalSessions')}>
              {t('attendanceStats.colSessions')}
            </SortHeader>
            <SortHeader active={sortKey === 'hadirRate'} dir={dir} onClick={() => setSort('hadirRate')}>
              {t('attendanceStats.colAttRate')}
            </SortHeader>
            <SortHeader active={sortKey === 'totalHours'} dir={dir} onClick={() => setSort('totalHours')}>
              {t('attendanceStats.colHours')}
            </SortHeader>
            <th className="px-3 py-2 text-right">{t('attendanceStats.colLast')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sorted.map((s) => (
            <tr key={s.studentId}>
              <td className="px-3 py-2">{s.studentName}</td>
              <td className="px-3 py-2 text-right tabular-nums">{s.totalSessions}</td>
              <td className="px-3 py-2 text-right tabular-nums">{s.hadirRate.toFixed(0)}%</td>
              <td className="px-3 py-2 text-right tabular-nums">{s.totalHours.toFixed(1)}</td>
              <td className="px-3 py-2 text-right font-mono text-xs text-slate-500">
                {s.lastDate ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TeacherTable({ rows }: { rows: TeacherAggregate[] }) {
  const { t } = useTranslation()
  const [sortKey, setSortKey] = useState<TeacherSortKey>('totalSessions')
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')

  const sorted = useMemo(() => {
    const out = [...rows]
    out.sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      return dir === 'asc' ? av - bv : bv - av
    })
    return out
  }, [rows, sortKey, dir])

  const setSort = (k: TeacherSortKey) => {
    if (k === sortKey) setDir(dir === 'asc' ? 'desc' : 'asc')
    else {
      setSortKey(k)
      setDir('desc')
    }
  }

  return (
    <div className="max-h-96 overflow-auto rounded-md border border-slate-200">
      <table className="min-w-full text-sm">
        <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2">{t('attendanceStats.colName')}</th>
            <SortHeader active={sortKey === 'totalSessions'} dir={dir} onClick={() => setSort('totalSessions')}>
              {t('attendanceStats.colSessions')}
            </SortHeader>
            <SortHeader active={sortKey === 'totalHours'} dir={dir} onClick={() => setSort('totalHours')}>
              {t('attendanceStats.colHours')}
            </SortHeader>
            <SortHeader active={sortKey === 'uniqueStudents'} dir={dir} onClick={() => setSort('uniqueStudents')}>
              {t('attendanceStats.colStudents')}
            </SortHeader>
            <th className="px-3 py-2 text-right">{t('attendanceStats.colLast')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sorted.map((t) => (
            <tr key={t.teacherId}>
              <td className="px-3 py-2">{t.teacherName}</td>
              <td className="px-3 py-2 text-right tabular-nums">{t.totalSessions}</td>
              <td className="px-3 py-2 text-right tabular-nums">{t.totalHours.toFixed(1)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{t.uniqueStudents}</td>
              <td className="px-3 py-2 text-right font-mono text-xs text-slate-500">
                {t.lastDate ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SortHeader({
  children,
  active,
  dir,
  onClick,
}: {
  children: React.ReactNode
  active: boolean
  dir: 'asc' | 'desc'
  onClick: () => void
}) {
  return (
    <th className="px-3 py-2 text-right">
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 hover:text-slate-700 ${
          active ? 'text-slate-900' : ''
        }`}
      >
        {children}
        {active ? <span className="text-[10px]">{dir === 'asc' ? '▲' : '▼'}</span> : null}
      </button>
    </th>
  )
}

/* --- range filter pills --- */

function RangeFilter({
  active,
  availableYears,
  onChange,
}: {
  active: string
  availableYears: number[]
  onChange: (token: string) => void
}) {
  const { t } = useTranslation()
  const years = [...availableYears].sort((a, b) => b - a) // newest first
  const options: { token: string; label: string }[] = [
    { token: 'all', label: t('attendanceStats.rangeAll') },
    { token: 'mtd', label: t('attendanceStats.rangeMtd') },
    { token: 'ytd', label: t('attendanceStats.rangeYtd') },
    ...years.map((y) => ({ token: String(y), label: String(y) })),
  ]
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs uppercase tracking-wide text-slate-500">
        {t('attendanceStats.rangeLabel')}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => (
          <button
            key={opt.token}
            type="button"
            onClick={() => onChange(opt.token)}
            className={cn(
              'rounded-full border px-3 py-1 text-sm transition',
              opt.token === active
                ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900'
                : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}
