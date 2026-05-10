import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { deleteStudent, getStudent, updateStudent } from '@/api/students'
import { useMe } from '@/lib/auth'
import { Button } from '@/components/Button'
import { StudentForm } from '@/components/StudentForm'

export const Route = createFileRoute('/_authed/students/$id')({
  component: StudentDetailPage,
})

function StudentDetailPage() {
  const { id } = Route.useParams()
  const { data: user } = useMe()
  const isAdmin = user?.role === 'admin'
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{s.name}</h1>
        {isAdmin && !editing ? (
          <div className="flex gap-2">
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
          <dl className="grid gap-4 sm:grid-cols-2 text-sm">
            <Row label="ID Siswa" value={s.studentId} />
            <Row label="Nama" value={s.name} />
            <Row label="Tanggal Lahir" value={s.dateOfBirth.slice(0, 10)} />
            <Row label="Jenis Kelamin" value={s.gender === 'male' ? 'Laki-laki' : 'Perempuan'} />
            <Row label="Alamat" value={s.address ?? '—'} className="sm:col-span-2" />
            <Row label="Nama Orang Tua" value={s.parentName} />
            <Row label="Telepon Orang Tua" value={s.parentPhone} />
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
      <dd className="mt-1 text-slate-900">{value}</dd>
    </div>
  )
}
