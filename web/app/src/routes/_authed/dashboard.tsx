import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { GraduationCap, Users } from 'lucide-react'
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { getDashboardStats, type Bucket, type LevelKelompokCell } from '@/api/stats'
import { STUDENT_KELOMPOKS, STUDENT_LEVELS } from '@/api/types'
import { StudentLocationMap } from '@/components/StudentLocationMap'
import { useTranslation } from '@/i18n'

export const Route = createFileRoute('/_authed/dashboard')({
  component: DashboardPage,
})

const GENDER_COLORS: Record<string, string> = {
  female: '#ec4899', // pink-500
  male: '#3b82f6', // blue-500
}

const BAR_COLOR = '#0f172a' // slate-900
const BAR_MUTED = '#cbd5e1' // slate-300
const TOP_DAERAH_LIMIT = 10

function DashboardPage() {
  const { t } = useTranslation()
  const { data, isPending, isError } = useQuery({
    queryKey: ['stats', 'dashboard'],
    queryFn: getDashboardStats,
    staleTime: 30_000,
  })

  if (isError) {
    return <p className="text-red-600">{t('dashboard.loadError')}</p>
  }
  if (isPending || !data) {
    return <p className="text-slate-500">{t('common.loading')}</p>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('dashboard.heading')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('dashboard.intro')}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KPICard
          icon={<Users size={20} />}
          label={t('dashboard.activeStudents')}
          value={data.students.activeTotal}
          subtitle={t('dashboard.fromOfTotal', { n: data.students.total })}
        />
        <KPICard
          icon={<GraduationCap size={20} />}
          label={t('dashboard.activeTeachers')}
          value={data.teachers.activeTotal}
          subtitle={t('dashboard.fromOfTotal', { n: data.teachers.total })}
        />
        <GenderCard buckets={data.students.byGender} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <ChartCard title={t('dashboard.byLevel')}>
          <LevelBarChart buckets={data.students.byLevel} />
        </ChartCard>
        <ChartCard title={t('dashboard.byKelompok')}>
          <KelompokBarChart buckets={data.students.byKelompok} />
        </ChartCard>
      </div>

      <ChartCard title={t('dashboard.studentLocationTitle')}>
        <StudentLocationMap buckets={data.students.byKelompok} />
      </ChartCard>

      <ChartCard title={t('dashboard.teacherByDaerah')}>
        <DaerahBarChart buckets={data.teachers.byDaerah} />
      </ChartCard>

      <ChartCard title={t('dashboard.matrixTitle')}>
        <LevelKelompokMatrix matrix={data.students.matrix} />
      </ChartCard>
    </div>
  )
}

/* --- KPI cards --- */

function KPICard({
  icon,
  label,
  value,
  subtitle,
}: {
  icon: React.ReactNode
  label: string
  value: number | string
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

function GenderCard({ buckets }: { buckets: Bucket[] }) {
  const { t } = useTranslation()
  const total = buckets.reduce((acc, b) => acc + b.count, 0)
  const labelFor = (k: string) =>
    k === 'male' ? t('dashboard.male') : k === 'female' ? t('dashboard.female') : k
  const data = buckets
    .filter((b) => b.count > 0)
    .map((b) => ({
      name: labelFor(b.label),
      key: b.label,
      value: b.count,
    }))

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-sm text-slate-600">{t('dashboard.byGender')}</div>
      <div className="mt-2 flex items-center gap-4">
        <div className="h-24 w-24 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius={26}
                outerRadius={42}
                paddingAngle={2}
                stroke="none"
              >
                {data.map((d) => (
                  <Cell key={d.key} fill={GENDER_COLORS[d.key]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => `${v} (${total ? Math.round((v / total) * 100) : 0}%)`} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul className="space-y-1.5 text-sm">
          {buckets.map((b) => (
            <li key={b.label} className="flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: GENDER_COLORS[b.label] }}
              />
              <span className="font-medium">{labelFor(b.label)}</span>
              <span className="text-slate-500">{b.count}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/* --- chart cards --- */

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">{title}</h2>
      {children}
    </div>
  )
}

function HorizontalBarChart({
  rows,
  emptyMessage,
}: {
  rows: { label: string; count: number; muted?: boolean }[]
  emptyMessage: string
}) {
  if (rows.every((r) => r.count === 0)) {
    return <p className="text-sm text-slate-500">{emptyMessage}</p>
  }
  // Recharts horizontal bars: vertical layout with category on Y axis, count on X.
  const height = Math.max(140, rows.length * 36)
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={rows}
          layout="vertical"
          margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
        >
          <XAxis type="number" allowDecimals={false} stroke="#94a3b8" fontSize={12} />
          <YAxis
            type="category"
            dataKey="label"
            stroke="#475569"
            fontSize={12}
            width={130}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip cursor={{ fill: 'rgba(15,23,42,0.05)' }} />
          <Bar dataKey="count" radius={[0, 4, 4, 0]}>
            {rows.map((r, i) => (
              <Cell key={i} fill={r.muted ? BAR_MUTED : BAR_COLOR} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function LevelBarChart({ buckets }: { buckets: Bucket[] }) {
  const { t } = useTranslation()
  const rows = buckets.map((b) => ({
    label: b.label === '' ? t('common.notFilled') : b.label,
    count: b.count,
    muted: b.label === '',
  }))
  rows.sort((a, b) => {
    const orderA = canonicalLevelIndex(a.label)
    const orderB = canonicalLevelIndex(b.label)
    return orderA - orderB
  })
  return <HorizontalBarChart rows={rows} emptyMessage={t('dashboard.emptyLevel')} />
}

function canonicalLevelIndex(label: string) {
  const idx = (STUDENT_LEVELS as readonly string[]).indexOf(label)
  return idx === -1 ? STUDENT_LEVELS.length : idx
}

function KelompokBarChart({ buckets }: { buckets: Bucket[] }) {
  const { t } = useTranslation()
  const rows = buckets.map((b) => ({ label: b.label, count: b.count }))
  rows.sort((a, b) => canonicalKelompokIndex(a.label) - canonicalKelompokIndex(b.label))
  return <HorizontalBarChart rows={rows} emptyMessage={t('dashboard.emptyKelompok')} />
}

function canonicalKelompokIndex(label: string) {
  const idx = (STUDENT_KELOMPOKS as readonly string[]).indexOf(label)
  return idx === -1 ? STUDENT_KELOMPOKS.length : idx
}

function DaerahBarChart({ buckets }: { buckets: Bucket[] }) {
  const { t } = useTranslation()
  if (buckets.length <= TOP_DAERAH_LIMIT) {
    return (
      <HorizontalBarChart
        rows={buckets.map((b) => ({ label: b.label, count: b.count }))}
        emptyMessage={t('dashboard.emptyDaerah')}
      />
    )
  }
  const top = buckets.slice(0, TOP_DAERAH_LIMIT)
  const rest = buckets.slice(TOP_DAERAH_LIMIT)
  const restCount = rest.reduce((acc, b) => acc + b.count, 0)
  const rows = [
    ...top.map((b) => ({ label: b.label, count: b.count })),
    { label: t('dashboard.other', { n: rest.length }), count: restCount, muted: true },
  ]
  return <HorizontalBarChart rows={rows} emptyMessage={t('dashboard.emptyDaerah')} />
}

/* --- matrix --- */

function LevelKelompokMatrix({ matrix }: { matrix: LevelKelompokCell[] }) {
  const { t } = useTranslation()
  const levels = [...STUDENT_LEVELS]
  const kelompoks = [...STUDENT_KELOMPOKS]

  // Build a level → kelompok → count grid.
  const grid: Record<string, Record<string, number>> = {}
  for (const l of levels) grid[l] = {}
  let max = 0
  for (const cell of matrix) {
    if (!grid[cell.level]) grid[cell.level] = {}
    grid[cell.level][cell.kelompok] = cell.count
    if (cell.count > max) max = cell.count
  }

  const colTotals: Record<string, number> = {}
  for (const k of kelompoks) colTotals[k] = 0
  let grandTotal = 0
  for (const l of levels) {
    for (const k of kelompoks) {
      const n = grid[l]?.[k] ?? 0
      colTotals[k] += n
      grandTotal += n
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-slate-500">
            <th className="px-3 py-2 text-left">{t('dashboard.matrixRowHeader')}</th>
            {kelompoks.map((k) => (
              <th key={k} className="px-3 py-2 text-right">
                {k}
              </th>
            ))}
            <th className="px-3 py-2 text-right text-slate-700">{t('dashboard.total')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {levels.map((l) => {
            const rowTotal = kelompoks.reduce((acc, k) => acc + (grid[l]?.[k] ?? 0), 0)
            return (
              <tr key={l}>
                <th className="px-3 py-2 text-left font-medium text-slate-700">{l}</th>
                {kelompoks.map((k) => {
                  const n = grid[l]?.[k] ?? 0
                  return (
                    <td key={k} className="px-3 py-2 text-right">
                      <Cellish count={n} max={max} />
                    </td>
                  )
                })}
                <td className="px-3 py-2 text-right font-semibold text-slate-700">
                  {rowTotal || '—'}
                </td>
              </tr>
            )
          })}
          <tr className="border-t-2 border-slate-200">
            <th className="px-3 py-2 text-left font-semibold text-slate-700">
              {t('dashboard.total')}
            </th>
            {kelompoks.map((k) => (
              <td key={k} className="px-3 py-2 text-right font-semibold text-slate-700">
                {colTotals[k] || '—'}
              </td>
            ))}
            <td className="px-3 py-2 text-right font-semibold text-slate-900">{grandTotal}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function Cellish({ count, max }: { count: number; max: number }) {
  if (count === 0) return <span className="text-slate-300">—</span>
  // Heatmap: scale opacity from 0.15 to 0.85 across [1, max].
  const ratio = max > 0 ? count / max : 0
  const opacity = 0.15 + 0.7 * ratio
  return (
    <span
      className="inline-flex h-7 min-w-7 items-center justify-center rounded px-2 text-slate-900"
      style={{ backgroundColor: `rgba(15, 23, 42, ${opacity.toFixed(2)})`, color: opacity > 0.5 ? '#fff' : undefined }}
    >
      {count}
    </span>
  )
}
