import type { Student } from '@/api/types'
import { ageInYears } from '@/lib/age'
import { useTranslation } from '@/i18n'
import { useStudentStatusLabel } from '@/i18n/labels'

export function StudentDetail({ student: s }: { student: Student }) {
  const { t } = useTranslation()
  const statusLabel = useStudentStatusLabel()
  const age = ageInYears(s.dateOfBirth)
  const dobLabel = s.dateOfBirth
    ? `${s.dateOfBirth.slice(0, 10)}${
        age !== null ? ` (${t('students.detailAgeSuffix', { n: age })})` : ''
      }`
    : '—'

  const genderLabel = s.gender === 'male' ? t('dashboard.male') : t('dashboard.female')

  return (
    <dl className="grid gap-4 text-sm sm:grid-cols-2">
      <Row label={t('students.fName')} value={s.name} />
      <Row label={t('students.fNickname')} value={s.nickname ?? '—'} />
      <Row label={t('students.fDob')} value={dobLabel} />
      <Row label={t('students.fGender')} value={genderLabel} />
      <Row label={t('students.fLevel')} value={s.level} />
      <Row label={t('students.fKelompok')} value={s.kelompok} />
      <Row label={t('students.fCity')} value={s.city ?? '—'} />
      <Row label={t('students.fJoinedAt')} value={s.joinedAt?.slice(0, 10) ?? '—'} />
      <Row label={t('students.fStatus')} value={statusLabel(s.status)} />
      <Row label={t('students.fLeftAt')} value={s.leftAt?.slice(0, 10) ?? '—'} />
      <Row label={t('students.fLeaveReason')} value={s.leaveReason ?? '—'} />
      <Row label={t('students.fParentName')} value={s.parentName ?? '—'} />
      <Row label={t('students.fParentPhone')} value={s.parentPhone ?? '—'} />
      <Row label={t('students.fParentEmail')} value={s.parentEmail ?? '—'} className="sm:col-span-2" />
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
