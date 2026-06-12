import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
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

const searchSchema = z.object({
  range: z.string().optional().catch(undefined),
})

export const Route = createFileRoute('/_authed/attendance')({
  validateSearch: searchSchema,
  component: AttendanceStatsPage,
})

function resolveRange(token: string | undefined, t: TFunction<'attendance'>, today = new Date()) {
  const yyyy = today.getFullYear()
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  const dd = String(today.getDate()).padStart(2, '0')
  const todayIso = `${yyyy}-${mm}-${dd}`

  if (token === 'ytd') {
    return { dateFrom: `${yyyy}-01-01`, dateTo: todayIso, label: t('rangeYtd') }
  }
  if (token === 'mtd') {
    return { dateFrom: `${yyyy}-${mm}-01`, dateTo: todayIso, label: t('rangeMtd') }
  }
  if (token && /^\d{4}$/.test(token)) {
    return {
      dateFrom: `${token}-01-01`,
      dateTo: `${token}-12-31`,
      label: token,
    }
  }
  return { dateFrom: undefined, dateTo: undefined, label: t('rangeAll') }
}

const STATUS_COLORS: Record<AttendanceStatus, string> = {
  hadir: '#10b981',
  izin_murid: '#f59e0b',
  izin_guru: '#f97316',
  by_vn: '#0ea5e9',
}

function AttendanceStatsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate({ from: '/attendance' })
  const { range } = Route.useSearch()
  const resolved = useMemo(() => resolveRange(range, t), [range, t])

  const { data, isPending, isError } = useQuery({
    queryKey: ['stats', 'attendance', resolved.dateFrom ?? null, resolved.dateTo ?? null],
    queryFn: () =>
      getAttendanceStats({ dateFrom: resolved.dateFrom, dateTo: resolved.dateTo }),
    staleTime: 60_000,
  })

  if (isError) return <p className="text-red-600">{t('attendance.loadFailed')}</p>
  if (isPending || !data) return <p className="text-slate-500">{t('common.loading')}</p>

  const activeToken = range ?? 'all'
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('attendance.title')}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {t('attendance.subtitle')}
        </p>
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
          label={t('attendance.totalSessions')}
          value={data.total.sessions.toLocaleString('id-ID')}
          subtitle={resolved.label}
        />
        <KPICard
          icon={<Clock size={20} />}
          label={t('attendance.totalHours')}
          value={`${data.total.hours.toFixed(0).toLocaleString()} ${t('attendance.hoursUnit', { count: '' }).trim()}`}
          subtitle={resolved.label}
        />
        <KPICard
          icon={<Sparkles size={20} />}
          label={t('attendance.last30Days')}
          value={data.total.last30Days.toLocaleString('id-ID')}
          subtitle={t('attendance.last30DaysSubtitle')}
        />
        <KPICard
          icon={<Users size={20} />}
          label={t('attendance.activePairs')}
          value={data.total.activePairs.toLocaleString('id-ID')}
          subtitle={t('attendance.activePairsSubtitle')}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title={t('attendance.sessionsPerMonth')} className="lg:col-span-2">
          <MonthlyChart data={data.monthly} />
        </ChartCard>
        <ChartCard title={t('attendance.statusDistribution')}>
          <StatusDonut buckets={data.byStatus} total={data.total.sessions} />
        </ChartCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title={t('attendance.perStudent')}>
          <StudentTable rows={data.byStudent} />
        </ChartCard>
        <ChartCard title={t('attendance.perTeacher')}>
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
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3 text-slate-600">
        <span className="rounded-md bg-slate-100 p-2">{icon}</span>
        <span className="text-sm">{label}</span>
      </div>
      <p className="mt-3 text-3xl font-semibold">{value}</p>
      {subtitle ? <p className="mt-1 text-xs text-slate-500">{subtitle}</p> : null}
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
    <div className={`rounded-lg border border-slate-200 bg-white p-5 shadow-sm ${className ?? ''}`}>
      <h2 className="mb-3 text-sm font-semibold text-slate-700">{title}</h2>
      {children}
    </div>
  )
}

/* --- monthly trend chart --- */

function MonthlyChart({ data }: { data: { month: string; sessions: number; hours: number }[] }) {
  const { t } = useTranslation()
  if (data.length === 0) {
    return <p className="text-sm text-slate-500">{t('attendance.noData')}</p>
  }
  return (
    <div style={{ width: '100%', height: 280 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 16, bottom: 4, left: 4 }}>
          <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
          <XAxis dataKey="month" stroke="#64748b" fontSize={11} interval="preserveStartEnd" />
          <YAxis stroke="#64748b" fontSize={11} allowDecimals={false} />
          <Tooltip
            formatter={(v: number, k: string) => (k === 'hours' ? [t('attendance.hoursUnit', { count: v.toFixed(1) }), t('attendance.columnHours')] : [v, t('attendance.columnSessions')])}
            labelFormatter={(label) => t('attendance.monthLabel', { label })}
          />
          <Line type="monotone" dataKey="sessions" stroke="#0f172a" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
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
  const data = buckets
    .filter((b) => b.count > 0)
    .map((b) => ({
      name: t(`statusLabels.${b.label}`),
      key: b.label as AttendanceStatus,
      value: b.count,
    }))
  if (data.length === 0) {
    return <p className="text-sm text-slate-500">{t('attendance.noData')}</p>
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
            <span className="truncate font-medium">
              {t(`statusLabels.${b.label}`)}
            </span>
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
            <th className="px-3 py-2">{t('attendance.columnName')}</th>
            <SortHeader active={sortKey === 'totalSessions'} dir={dir} onClick={() => setSort('totalSessions')}>
              {t('attendance.columnSessions')}
            </SortHeader>
            <SortHeader active={sortKey === 'hadirRate'} dir={dir} onClick={() => setSort('hadirRate')}>
              {t('attendance.columnHadirRate')}
            </SortHeader>
            <SortHeader active={sortKey === 'totalHours'} dir={dir} onClick={() => setSort('totalHours')}>
              {t('attendance.columnHours')}
            </SortHeader>
            <th className="px-3 py-2 text-right">{t('attendance.columnLastSession')}</th>
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
                {s.lastDate ?? '\u2014'}
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
            <th className="px-3 py-2">{t('attendance.columnName')}</th>
            <SortHeader active={sortKey === 'totalSessions'} dir={dir} onClick={() => setSort('totalSessions')}>
              {t('attendance.columnSessions')}
            </SortHeader>
            <SortHeader active={sortKey === 'totalHours'} dir={dir} onClick={() => setSort('totalHours')}>
              {t('attendance.columnHours')}
            </SortHeader>
            <SortHeader active={sortKey === 'uniqueStudents'} dir={dir} onClick={() => setSort('uniqueStudents')}>
              {t('attendance.columnUniqueStudents')}
            </SortHeader>
            <th className="px-3 py-2 text-right">{t('attendance.columnLastSession')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sorted.map((tr) => (
            <tr key={tr.teacherId}>
              <td className="px-3 py-2">{tr.teacherName}</td>
              <td className="px-3 py-2 text-right tabular-nums">{tr.totalSessions}</td>
              <td className="px-3 py-2 text-right tabular-nums">{tr.totalHours.toFixed(1)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{tr.uniqueStudents}</td>
              <td className="px-3 py-2 text-right font-mono text-xs text-slate-500">
                {tr.lastDate ?? '\u2014'}
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
        {active ? <span className="text-[10px]">{dir === 'asc' ? '\u25B2' : '\u25BC'}</span> : null}
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
  const years = [...availableYears].sort((a, b) => b - a)
  const options: { token: string; label: string }[] = [
    { token: 'all', label: t('attendance.rangeAll') },
    { token: 'ytd', label: t('attendance.rangeYtd') },
    { token: 'mtd', label: t('attendance.rangeMtd') },
    ...years.map((y) => ({ token: String(y), label: String(y) })),
  ]
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs uppercase tracking-wide text-slate-500">{t('attendance.timeRange')}</span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => (
          <button
            key={opt.token}
            type="button"
            onClick={() => onChange(opt.token)}
            className={cn(
              'rounded-full border px-3 py-1 text-sm transition',
              opt.token === active
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}