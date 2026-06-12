import { useTranslation } from 'react-i18next'
import type { Student } from '@/api/types'
import { ageInYears } from '@/lib/age'

export function StudentDetail({ student: s }: { student: Student }) {
  const { t } = useTranslation()
  const statusLabel = s.status === 'active' ? t('students.detail.statusActive') : t('students.detail.statusLeft')
  const dobLabel = s.dateOfBirth
    ? `${s.dateOfBirth.slice(0, 10)}${
        ageInYears(s.dateOfBirth) !== null ? ` ${t('students.form.dateOfBirthYears', { age: ageInYears(s.dateOfBirth) })}` : ''
      }`
    : '—'

  return (
    <dl className="grid gap-4 text-sm sm:grid-cols-2">
      <Row label={t('students.detail.name')} value={s.name} />
      <Row label={t('students.detail.nickname')} value={s.nickname ?? '—'} />
      <Row label={t('students.detail.dateOfBirth')} value={dobLabel} />
      <Row label={t('students.detail.gender')} value={s.gender === 'male' ? t('students.form.genderMale') : t('students.form.genderFemale')} />
      <Row label={t('students.detail.level')} value={s.level} />
      <Row label={t('students.detail.kelompok')} value={s.kelompok} />
      <Row label={t('students.detail.city')} value={s.city ?? '—'} />
      <Row label={t('students.detail.joinedAt')} value={s.joinedAt?.slice(0, 10) ?? '—'} />
      <Row label={t('students.detail.status')} value={statusLabel} />
      <Row label={t('students.detail.leftAt')} value={s.leftAt?.slice(0, 10) ?? '—'} />
      <Row label={t('students.detail.leaveReason')} value={s.leaveReason ?? '—'} />
      <Row label={t('students.detail.parentName')} value={s.parentName ?? '—'} />
      <Row label={t('students.detail.parentPhone')} value={s.parentPhone ?? '—'} />
      <Row label={t('students.detail.parentEmail')} value={s.parentEmail ?? '—'} className="sm:col-span-2" />
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