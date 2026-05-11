import { ATTENDANCE_STATUS_LABELS, type Attendance } from '@/api/types'

export function AttendanceDetail({ attendance: a }: { attendance: Attendance }) {
  return (
    <div className="space-y-5 text-sm">
      <dl className="grid gap-4 sm:grid-cols-2">
        <Row label="Tanggal" value={a.date.slice(0, 10)} />
        <Row label="Status" value={ATTENDANCE_STATUS_LABELS[a.status]} />
        <Row label="Pengajar" value={a.teacherName} />
        <Row label="Generus" value={a.studentName} />
        <Row
          label="Durasi"
          value={a.durationMin != null ? `${a.durationMin} menit` : '—'}
        />
      </dl>
      <div>
        <div className="mb-2 text-xs uppercase tracking-wide text-slate-500">Materi</div>
        {a.materi ? (
          <pre className="whitespace-pre-wrap break-words rounded-md border border-slate-200 bg-slate-50 p-3 font-sans text-sm text-slate-900">
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
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 break-words text-slate-900">{value}</dd>
    </div>
  )
}
