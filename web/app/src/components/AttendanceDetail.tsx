import { useTranslation } from 'react-i18next'
import { type Attendance } from '@/api/types'

export function AttendanceDetail({ attendance: a }: { attendance: Attendance }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-5 text-sm">
      <dl className="grid gap-4 sm:grid-cols-2">
        <Row label={t('sessions.detail.date')} value={a.date.slice(0, 10)} />
        <Row label={t('sessions.detail.status')} value={t(`statusLabels.${a.status}`)} />
        <Row label={t('sessions.detail.teacher')} value={a.teacherName} />
        <Row label={t('sessions.detail.student')} value={a.studentName} />
        <Row
          label={t('sessions.detail.duration')}
          value={a.durationMin != null ? t('sessions.detail.durationMin', { min: a.durationMin }) : '\u2014'}
        />
      </dl>
      <div>
        <div className="mb-2 text-xs uppercase tracking-wide text-slate-500">{t('sessions.detail.materi')}</div>
        {a.materi ? (
          <pre className="whitespace-pre-wrap break-words rounded-md border border-slate-200 bg-slate-50 p-3 font-sans text-sm text-slate-900">
            {a.materi}
          </pre>
        ) : (
          <p className="text-slate-400">{'\u2014'}</p>
        )}
      </div>
    </div>
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