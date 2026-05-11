import type { Student } from '@/api/types'
import { ageInYears } from '@/lib/age'

export function StudentDetail({ student: s }: { student: Student }) {
  const statusLabel = s.status === 'active' ? 'Aktif' : 'Keluar'
  const dobLabel = s.dateOfBirth
    ? `${s.dateOfBirth.slice(0, 10)}${
        ageInYears(s.dateOfBirth) !== null ? ` (${ageInYears(s.dateOfBirth)} tahun)` : ''
      }`
    : '—'

  return (
    <dl className="grid gap-4 text-sm sm:grid-cols-2">
      <Row label="Nama" value={s.name} />
      <Row label="Nama Panggilan" value={s.nickname ?? '—'} />
      <Row label="Tanggal Lahir" value={dobLabel} />
      <Row label="Jenis Kelamin" value={s.gender === 'male' ? 'Laki-laki' : 'Perempuan'} />
      <Row label="Jenjang" value={s.level} />
      <Row label="Kelompok" value={s.kelompok} />
      <Row label="Kota" value={s.city ?? '—'} />
      <Row label="Tanggal Masuk" value={s.joinedAt?.slice(0, 10) ?? '—'} />
      <Row label="Status" value={statusLabel} />
      <Row label="Tanggal Keluar" value={s.leftAt?.slice(0, 10) ?? '—'} />
      <Row label="Keterangan Keluar" value={s.leaveReason ?? '—'} />
      <Row label="Nama Orang Tua" value={s.parentName ?? '—'} />
      <Row label="Telepon Orang Tua" value={s.parentPhone ?? '—'} />
      <Row label="Email Orang Tua" value={s.parentEmail ?? '—'} className="sm:col-span-2" />
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
