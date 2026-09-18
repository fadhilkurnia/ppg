import { type Attendance } from '@/api/types'
import { useAttendanceStatusLabel, useTranslation } from '@/lib/i18n'

export function AttendanceDetail({ attendance: a }: { attendance: Attendance }) {
  const { t } = useTranslation()
  const statusLabel = useAttendanceStatusLabel()
  return (
    <div className="space-y-5 text-sm">
      <dl className="grid gap-4 sm:grid-cols-2">
        <Row label={t('sessions.detailDate')} value={a.date.slice(0, 10)} />
        <Row label={t('sessions.detailStatus')} value={statusLabel(a.status)} />
        <Row label={t('sessions.detailTeacher')} value={a.teacherName} />
        <Row label={t('sessions.detailStudent')} value={a.studentName} />
        <Row
          label={t('sessions.detailDuration')}
          value={a.durationMin != null ? t('sessions.durationMinutes', { n: a.durationMin }) : '—'}
        />
      </dl>
      <div>
        <div className="mb-2 text-xs uppercase tracking-wide text-slate-500">
          {t('sessions.detailMateri')}
        </div>
        {a.materi ? (
          <pre className="whitespace-pre-wrap break-words rounded-md border border-slate-200 bg-slate-50 p-3 font-sans text-sm text-slate-900 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-100">
            {a.materi}
          </pre>
        ) : (
          <p className="text-slate-400">—</p>
        )}
      </div>
    </div>
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
