import { useTranslation } from 'react-i18next'
import type { Teacher } from '@/api/types'

export function TeacherDetail({ teacher: t }: { teacher: Teacher }) {
  const { t: tr } = useTranslation()
  const statusLabel = t.status === 'active' ? tr('teachers.detail.statusActive') : tr('teachers.detail.statusRetired')
  return (
    <dl className="grid gap-4 text-sm sm:grid-cols-2">
      <Row label={tr('teachers.detail.name')} value={t.name} />
      <Row label={tr('teachers.detail.nickname')} value={t.nickname ?? '—'} />
      <Row label={tr('teachers.detail.kelompok')} value={t.kelompok} />
      <Row label={tr('teachers.detail.desa')} value={t.desa} />
      <Row label={tr('teachers.detail.daerah')} value={t.daerah} className="sm:col-span-2" />
      <Row label={tr('teachers.detail.joinedAt')} value={t.joinedAt?.slice(0, 10) ?? '—'} />
      <Row label={tr('teachers.detail.retiredAt')} value={t.retiredAt?.slice(0, 10) ?? '—'} />
      <Row label={tr('teachers.detail.status')} value={statusLabel} />
      <Row label={tr('teachers.detail.notes')} value={t.notes ?? '—'} className="sm:col-span-2" />
    </dl>
  )
}

function Row({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 break-words text-slate-900">{value}</dd>
    </div>
  )
}