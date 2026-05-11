import type { Teacher } from '@/api/types'

export function TeacherDetail({ teacher: t }: { teacher: Teacher }) {
  const statusLabel = t.status === 'active' ? 'Aktif' : 'Purna'
  return (
    <dl className="grid gap-4 text-sm sm:grid-cols-2">
      <Row label="Nama Pengajar" value={t.name} />
      <Row label="Nama Panggilan" value={t.nickname ?? '—'} />
      <Row label="Kelompok" value={t.kelompok} />
      <Row label="Desa" value={t.desa} />
      <Row label="Daerah" value={t.daerah} className="sm:col-span-2" />
      <Row label="Tanggal Masuk" value={t.joinedAt?.slice(0, 10) ?? '—'} />
      <Row label="Tanggal Purna" value={t.retiredAt?.slice(0, 10) ?? '—'} />
      <Row label="Status" value={statusLabel} />
      <Row label="Keterangan" value={t.notes ?? '—'} className="sm:col-span-2" />
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
