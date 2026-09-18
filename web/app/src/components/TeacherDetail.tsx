import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { GraduationCap } from 'lucide-react'

import { getStudentsForTeacher } from '@/api/studentTeachers'
import type { Teacher } from '@/api/types'
import { useMe } from '@/lib/auth'
import { useTeacherStatusLabel, useTranslation } from '@/lib/i18n'
import { AssignStudentsModal } from './AssignStudentsModal'

export function TeacherDetail({ teacher: tc }: { teacher: Teacher }) {
  const { t } = useTranslation()
  const { data: user } = useMe()
  const isAdmin = user?.role === 'admin'
  const [isAssignOpen, setIsAssignOpen] = useState(false)

  const statusLabel = useTeacherStatusLabel()

  // Fetch assigned students for this teacher
  const { data: students, isPending: studentsLoading } = useQuery({
    queryKey: ['teacher-students', tc.id],
    queryFn: () => getStudentsForTeacher(tc.id),
    enabled: !!tc.id,
  })

  return (
    <>
      <dl className="grid gap-4 text-sm sm:grid-cols-2">
        <Row label={t('teachers.fName')} value={tc.name} />
        <Row label={t('teachers.fNickname')} value={tc.nickname ?? '—'} />
        <Row label={t('teachers.fKelompok')} value={tc.kelompok} />
        <Row label={t('teachers.fDesa')} value={tc.desa} />
        <Row label={t('teachers.fDaerah')} value={tc.daerah} className="sm:col-span-2" />
        <Row label={t('teachers.fJoinedAt')} value={tc.joinedAt?.slice(0, 10) ?? '—'} />
        <Row label={t('teachers.fRetiredAt')} value={tc.retiredAt?.slice(0, 10) ?? '—'} />
        <Row label={t('teachers.fStatus')} value={statusLabel(tc.status)} />
        <Row label={t('teachers.fNotes')} value={tc.notes ?? '—'} className="sm:col-span-2" />

        {/* Assigned Students Section */}
        <div className="sm:col-span-2 border-t border-slate-200 dark:border-slate-800 pt-3">
          <div className="flex items-center justify-between mb-2">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {t('teachers.assignedStudents')}
            </dt>
            {isAdmin ? (
              <button
                type="button"
                onClick={() => setIsAssignOpen(true)}
                className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
              >
                <GraduationCap size={13} />
                {t('teachers.manageStudents')}
              </button>
            ) : null}
          </div>
          <dd>
            {studentsLoading ? (
              <p className="text-xs text-slate-400">{t('common.loading')}</p>
            ) : students && students.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {students.map((s) => (
                  <span
                    key={s.id}
                    className="inline-flex items-center gap-1 rounded-md bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800/60 px-2.5 py-1 text-xs text-blue-800 dark:text-blue-200 font-medium"
                  >
                    <span>{s.name}</span>
                    {s.nickname && <span className="opacity-75 font-normal">({s.nickname})</span>}
                    <span className="text-[10px] text-blue-600 dark:text-blue-400">• {s.level}</span>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">
                {t('teachers.noAssignedStudents')}
              </p>
            )}
          </dd>
        </div>
      </dl>

      {isAdmin && isAssignOpen ? (
        <AssignStudentsModal
          teacher={tc}
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
