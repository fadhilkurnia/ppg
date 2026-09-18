import { useMemo, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'

import { useTranslation, formatKelompokTag } from '@/lib/i18n'
import { listTingkats } from '@/api/kurikulum'
import { listStudents, type Student } from '@/api/students'
import { ageInYears } from '@/lib/age'
import { tingkatForAge } from '@/lib/tingkat'
import { Avatar } from '@/components/Avatar'
import { Input } from '@/components/Input'

export const Route = createFileRoute('/_authed/achievement/')({
  component: AchievementPage,
})

function AchievementPage() {
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  const { data: tingkats = [] } = useQuery({ queryKey: ['tingkats'], queryFn: listTingkats })
  const { data: students, isPending } = useQuery({
    queryKey: ['students', 'achievement'],
    queryFn: () => listStudents({ status: 'active', limit: 500 }),
  })

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const items = students?.items ?? []
    if (!needle) return items
    return items.filter(
      (s) =>
        s.name.toLowerCase().includes(needle) ||
        (s.nickname ?? '').toLowerCase().includes(needle),
    )
  }, [students, q])

  const total = students?.total ?? 0

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">{t('achievement.grid.title')}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {t('common.pageStatus', { page: 1, total: 1, count: total })}
        </p>
      </div>

      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3 top-3 text-slate-400" />
        <Input
          className="pl-9"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('achievement.grid.search')}
        />
      </div>

      {isPending ? (
        <p className="py-8 text-center text-sm text-slate-500">{t('common.loading')}</p>
      ) : filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">{t('achievement.grid.empty')}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
          {filtered.map((s) => (
            <StudentThumb key={s.id} s={s} tingkats={tingkats} />
          ))}
        </div>
      )}
    </div>
  )
}

function StudentThumb({
  s,
  tingkats,
}: {
  s: Student
  tingkats: { id: string; nama: string; urutan: number; umur?: number | null }[]
}) {
  const { t } = useTranslation()
  const age = ageInYears(s.dateOfBirth)
  const tingkat = tingkatForAge(age, tingkats as Parameters<typeof tingkatForAge>[1])
  return (
    <Link
      to="/achievement/$studentId"
      params={{ studentId: s.id }}
      className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
    >
      <Avatar name={s.name} className="h-12 w-12 text-base" />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{s.name}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {age != null ? t('achievement.grid.age', { age }) : t('common.notFilled')}
          {tingkat ? ` · ${tingkat.nama}` : ''}
        </p>
        <span className="mt-1 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {formatKelompokTag(s.kelompok)}
        </span>
      </div>
    </Link>
  )
}
