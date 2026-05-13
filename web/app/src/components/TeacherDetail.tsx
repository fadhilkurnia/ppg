import type { Teacher } from '@/api/types'
import { useTranslation } from '@/i18n'
import { useTeacherStatusLabel } from '@/i18n/labels'

export function TeacherDetail({ teacher: te }: { teacher: Teacher }) {
  const { t } = useTranslation()
  const statusLabel = useTeacherStatusLabel()
  return (
    <dl className="grid gap-4 text-sm sm:grid-cols-2">
      <Row label={t('teachers.fName')} value={te.name} />
      <Row label={t('teachers.fNickname')} value={te.nickname ?? '—'} />
      <Row label={t('teachers.fKelompok')} value={te.kelompok} />
      <Row label={t('teachers.fDesa')} value={te.desa} />
      <Row label={t('teachers.fDaerah')} value={te.daerah} className="sm:col-span-2" />
      <Row label={t('teachers.fJoinedAt')} value={te.joinedAt?.slice(0, 10) ?? '—'} />
      <Row label={t('teachers.fRetiredAt')} value={te.retiredAt?.slice(0, 10) ?? '—'} />
      <Row label={t('teachers.fStatus')} value={statusLabel(te.status)} />
      <Row label={t('teachers.fNotes')} value={te.notes ?? '—'} className="sm:col-span-2" />
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
