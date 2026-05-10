import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { z } from 'zod'

import { deleteStudent, getStudent, updateStudent } from '@/api/students'
import { useMe } from '@/lib/auth'
import { Button } from '@/components/Button'
import { StudentForm } from '@/components/StudentForm'

export const Route = createFileRoute('/_authed/students/$id')({
  validateSearch: z.object({ edit: z.literal(1).optional().catch(undefined) }),
  component: StudentDetailPage,
})

function StudentDetailPage() {
  const { id } = Route.useParams()
  const { edit } = Route.useSearch()
  const { data: user } = useMe()
  const isAdmin = user?.role === 'admin'
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [editing, setEditing] = useState(isAdmin && edit === 1)

  const studentQuery = useQuery({
    queryKey: ['students', id],
    queryFn: () => getStudent(id),
  })

  const updateMutation = useMutation({
    mutationFn: (input: Parameters<typeof updateStudent>[1]) => updateStudent(id, input),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['students'] })
      setEditing(false)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteStudent(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['students'] })
      await navigate({ to: '/students' })
    },
  })

  if (studentQuery.isPending) return <p className="text-slate-500">Memuat…</p>
  if (studentQuery.isError || !studentQuery.data) return <p className="text-red-600">Gagal memuat data.</p>

  const s = studentQuery.data
  const statusLabel = s.status === 'active' ? 'Aktif' : 'Keluar'

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold break-words">{s.name}</h1>
        {isAdmin && !editing ? (
          <div className="flex gap-2 self-start sm:self-auto">
            <Button variant="secondary" onClick={() => setEditing(true)}>
              Ubah
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (confirm(`Hapus ${s.name}? Tindakan ini tidak dapat dibatalkan.`)) {
                  deleteMutation.mutate()
                }
              }}
              disabled={deleteMutation.isPending}
            >
              Hapus
            </Button>
          </div>
        ) : null}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        {editing ? (
          <StudentForm
            initial={s}
            submitLabel="Simpan"
            pending={updateMutation.isPending}
            error={updateMutation.error}
            onSubmit={(input) => updateMutation.mutate(input)}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <Row label="Nama" value={s.name} />
            <Row label="Nama Panggilan" value={s.nickname ?? '—'} />
            <Row label="Tanggal Lahir" value={s.dateOfBirth?.slice(0, 10) ?? '—'} />
            <Row label="Jenis Kelamin" value={s.gender === 'male' ? 'Laki-laki' : 'Perempuan'} />
            <Row label="Jenjang" value={s.level ?? '—'} />
            <Row label="Kelompok" value={s.kelompok ?? '—'} className="sm:col-span-2" />
            <Row label="Tanggal Masuk" value={s.joinedAt?.slice(0, 10) ?? '—'} />
            <Row label="Status" value={statusLabel} />
            <Row label="Tanggal Keluar" value={s.leftAt?.slice(0, 10) ?? '—'} />
            <Row label="Keterangan Keluar" value={s.leaveReason ?? '—'} />
            <Row label="Nama Orang Tua" value={s.parentName ?? '—'} />
            <Row label="Telepon Orang Tua" value={s.parentPhone ?? '—'} />
            <Row label="Email Orang Tua" value={s.parentEmail ?? '—'} className="sm:col-span-2" />
          </dl>
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
