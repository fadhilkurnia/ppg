import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Users } from 'lucide-react'

import { getTeachersForStudent } from '@/api/studentTeachers'
import type { Student } from '@/api/types'
import { ageInYears } from '@/lib/age'
import { useMe } from '@/lib/auth'
import { useStudentStatusLabel, useTranslation } from '@/lib/i18n'
import { AssignTeachersModal } from './AssignTeachersModal'

export function StudentDetail({ student: s }: { student: Student }) {
  const { t } = useTranslation()
  const { data: user } = useMe()
  const isAdmin = user?.role === 'admin'
  const [isAssignOpen, setIsAssignOpen] = useState(false)

  const statusLabel = useStudentStatusLabel()
  const age = ageInYears(s.dateOfBirth)
  const dobLabel = s.dateOfBirth
    ? `${s.dateOfBirth.slice(0, 10)}${
        age !== null ? ` (${t('students.detailAgeSuffix', { n: age })})` : ''
      }`
    : '—'
  const genderLabel = s.gender === 'male' ? t('dashboard.male') : t('dashboard.female')

  // Fetch assigned teachers for this student
  const { data: teachers, isPending: teachersLoading } = useQuery({
    queryKey: ['student-teachers', s.id],
    queryFn: () => getTeachersForStudent(s.id),
    enabled: !!s.id,
  })

  return (
    <>
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

        {/* Assigned Teachers Section */}
        <div className="sm:col-span-2 border-t border-slate-200 dark:border-slate-800 pt-3">
          <div className="flex items-center justify-between mb-2">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {t('students.assignedTeachers')}
            </dt>
            {isAdmin ? (
              <button
                type="button"
                onClick={() => setIsAssignOpen(true)}
                className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
              >
                <Users size={13} />
                {t('students.manageTeachers')}
              </button>
            ) : null}
          </div>
          <dd>
            {teachersLoading ? (
              <p className="text-xs text-slate-400">{t('common.loading')}</p>
            ) : teachers && teachers.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {teachers.map((tc) => (
                  <span
                    key={tc.id}
                    className="inline-flex items-center gap-1 rounded-md bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/60 px-2.5 py-1 text-xs text-emerald-800 dark:text-emerald-200 font-medium"
                  >
                    <span>{tc.name}</span>
                    {tc.nickname && <span className="opacity-75 font-normal">({tc.nickname})</span>}
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400">• {tc.kelompok}</span>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">
                {t('students.noAssignedTeachers')}
              </p>
            )}
          </dd>
        </div>
      </dl>

      {isAdmin && isAssignOpen ? (
        <AssignTeachersModal
          student={s}
          open={isAssignOpen}
          onClose={() => setIsAssignOpen(false)}
        />
      ) : null}
    </>
  )
}

function Row({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="mt-1 break-words text-slate-900 dark:text-slate-100">{value}</dd>
    </div>
  )
}

