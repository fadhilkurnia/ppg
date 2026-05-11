import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
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

import {
  getAttendanceStats,
  type StudentAggregate,
  type TeacherAggregate,
} from '@/api/stats'
import { ATTENDANCE_STATUS_LABELS, type AttendanceStatus } from '@/api/types'

export const Route = createFileRoute('/_authed/attendance')({
  component: AttendanceStatsPage,
})

const STATUS_COLORS: Record<AttendanceStatus, string> = {
  hadir: '#10b981',        // emerald-500
  izin_murid: '#f59e0b',   // amber-500
  izin_guru: '#f97316',    // orange-500
  by_vn: '#0ea5e9',        // sky-500
}

function AttendanceStatsPage() {
  const { data, isPending, isError } = useQuery({
    queryKey: ['stats', 'attendance'],
    queryFn: getAttendanceStats,
    staleTime: 60_000,
  })

  if (isError) return <p className="text-red-600">Gagal memuat statistik kehadiran.</p>
  if (isPending || !data) return <p className="text-slate-500">Memuat…</p>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Kehadiran</h1>
        <p className="mt-1 text-sm text-slate-500">
          Ringkasan dan analitik dari seluruh data Pengajian.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard
          icon={<CalendarCheck size={20} />}
          label="Total Sesi"
          value={data.total.sessions.toLocaleString('id-ID')}
        />
        <KPICard
          icon={<Clock size={20} />}
          label="Total Jam Ngaji"
          value={`${data.total.hours.toFixed(0).toLocaleString()} jam`}
        />
        <KPICard
          icon={<Sparkles size={20} />}
          label="Sesi 30 Hari Terakhir"
          value={data.total.last30Days.toLocaleString('id-ID')}
        />
        <KPICard
          icon={<Users size={20} />}
          label="Pasangan Aktif (30hr)"
          value={data.total.activePairs.toLocaleString('id-ID')}
          subtitle="Generus × Pengajar"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Sesi per Bulan" className="lg:col-span-2">
          <MonthlyChart data={data.monthly} />
        </ChartCard>
        <ChartCard title="Distribusi Status">
          <StatusDonut buckets={data.byStatus} total={data.total.sessions} />
        </ChartCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="Per Generus">
          <StudentTable rows={data.byStudent} />
        </ChartCard>
        <ChartCard title="Per Pengajar">
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
  if (data.length === 0) {
    return <p className="text-sm text-slate-500">Belum ada data.</p>
  }
  return (
    <div style={{ width: '100%', height: 280 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 16, bottom: 4, left: 4 }}>
          <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
          <XAxis dataKey="month" stroke="#64748b" fontSize={11} interval="preserveStartEnd" />
          <YAxis stroke="#64748b" fontSize={11} allowDecimals={false} />
          <Tooltip
            formatter={(v: number, k: string) => (k === 'hours' ? [`${v.toFixed(1)} jam`, 'Jam'] : [v, 'Sesi'])}
            labelFormatter={(label) => `Bulan ${label}`}
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
  const data = buckets
    .filter((b) => b.count > 0)
    .map((b) => ({
      name: ATTENDANCE_STATUS_LABELS[b.label as AttendanceStatus] ?? b.label,
      key: b.label as AttendanceStatus,
      value: b.count,
    }))
  if (data.length === 0) {
    return <p className="text-sm text-slate-500">Belum ada data.</p>
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
              {ATTENDANCE_STATUS_LABELS[b.label as AttendanceStatus] ?? b.label}
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
            <th className="px-3 py-2">Nama</th>
            <SortHeader active={sortKey === 'totalSessions'} dir={dir} onClick={() => setSort('totalSessions')}>
              Sesi
            </SortHeader>
            <SortHeader active={sortKey === 'hadirRate'} dir={dir} onClick={() => setSort('hadirRate')}>
              % Hadir
            </SortHeader>
            <SortHeader active={sortKey === 'totalHours'} dir={dir} onClick={() => setSort('totalHours')}>
              Jam
            </SortHeader>
            <th className="px-3 py-2 text-right">Sesi Terakhir</th>
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
            <th className="px-3 py-2">Nama</th>
            <SortHeader active={sortKey === 'totalSessions'} dir={dir} onClick={() => setSort('totalSessions')}>
              Sesi
            </SortHeader>
            <SortHeader active={sortKey === 'totalHours'} dir={dir} onClick={() => setSort('totalHours')}>
              Jam
            </SortHeader>
            <SortHeader active={sortKey === 'uniqueStudents'} dir={dir} onClick={() => setSort('uniqueStudents')}>
              # Generus
            </SortHeader>
            <th className="px-3 py-2 text-right">Sesi Terakhir</th>
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
