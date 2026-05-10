import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Search } from 'lucide-react'
import { z } from 'zod'

import { deleteStudent, listStudents } from '@/api/students'
import { STUDENT_KELOMPOKS, type Student } from '@/api/types'
import { useMe } from '@/lib/auth'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import { RowActions } from '@/components/RowActions'

const PAGE_SIZE = 20

const searchSchema = z.object({
  q: z.string().optional().catch(''),
  status: z.enum(['active', 'left']).optional().catch(undefined),
  kelompok: z.enum(STUDENT_KELOMPOKS).optional().catch(undefined),
  page: z.number().int().min(1).optional().catch(1),
})

export const Route = createFileRoute('/_authed/students/')({
  validateSearch: searchSchema,
  component: StudentsPage,
})

function StudentsPage() {
  const navigate = useNavigate({ from: '/students/' })
  const { q = '', status, kelompok, page = 1 } = Route.useSearch()
  const { data: user } = useMe()
  const isAdmin = user?.role === 'admin'

  const { data, isPending } = useQuery({
    queryKey: ['students', { q, status, kelompok, page }],
    queryFn: () =>
      listStudents({ q, status, kelompok, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
  })

  const qc = useQueryClient()
  const deleteMutation = useMutation({
    mutationFn: deleteStudent,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['students'] }),
  })

  const handleDelete = (s: Student) => {
    if (confirm(`Hapus ${s.name}? Tindakan ini tidak dapat dibatalkan.`)) {
      deleteMutation.mutate(s.id)
    }
  }

  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Generus</h1>
        {isAdmin ? (
          <Link to="/students/new" className="self-start sm:self-auto">
            <Button>
              <Plus size={16} className="mr-1" />
              Tambah Generus
            </Button>
          </Link>
        ) : null}
      </div>

      <form
        className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center"
        onSubmit={(e) => {
          e.preventDefault()
          const fd = new FormData(e.currentTarget)
          const next = String(fd.get('q') ?? '')
          const nextStatus = String(fd.get('status') ?? '')
          const nextKelompok = String(fd.get('kelompok') ?? '')
          void navigate({
            search: {
              q: next || undefined,
              status: nextStatus === 'active' || nextStatus === 'left' ? nextStatus : undefined,
              kelompok: (STUDENT_KELOMPOKS as readonly string[]).includes(nextKelompok)
                ? (nextKelompok as (typeof STUDENT_KELOMPOKS)[number])
                : undefined,
              page: 1,
            },
          })
        }}
      >
        <div className="relative max-w-md flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <Input name="q" defaultValue={q} placeholder="Cari nama atau panggilan" className="pl-9" />
        </div>
        <select
          name="status"
          defaultValue={status ?? ''}
          className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
        >
          <option value="">Semua status</option>
          <option value="active">Aktif</option>
          <option value="left">Keluar</option>
        </select>
        <select
          name="kelompok"
          defaultValue={kelompok ?? ''}
          className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
        >
          <option value="">Semua kelompok</option>
          {STUDENT_KELOMPOKS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <Button type="submit" variant="secondary" size="md">
          Terapkan
        </Button>
      </form>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2">Nama</th>
              <th className="hidden px-4 py-2 sm:table-cell">Panggilan</th>
              <th className="hidden px-4 py-2 sm:table-cell">L/P</th>
              <th className="hidden px-4 py-2 md:table-cell">Jenjang</th>
              <th className="hidden px-4 py-2 md:table-cell">Kelompok</th>
              <th className="px-4 py-2">Status</th>
              {isAdmin ? <th className="px-4 py-2 text-right">Aksi</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isPending ? (
              <tr>
                <td colSpan={isAdmin ? 7 : 6} className="px-4 py-6 text-center text-slate-500">
                  Memuat…
                </td>
              </tr>
            ) : data && data.items.length > 0 ? (
              data.items.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <Link
                      to="/students/$id"
                      params={{ id: s.id }}
                      className="text-slate-900 hover:underline"
                    >
                      {s.name}
                    </Link>
                  </td>
                  <td className="hidden px-4 py-2 sm:table-cell">{s.nickname ?? '—'}</td>
                  <td className="hidden px-4 py-2 sm:table-cell">{s.gender === 'male' ? 'L' : 'P'}</td>
                  <td className="hidden px-4 py-2 md:table-cell">{s.level ?? '—'}</td>
                  <td className="hidden px-4 py-2 md:table-cell">{s.kelompok ?? '—'}</td>
                  <td className="px-4 py-2">
                    <StatusPill status={s.status} />
                  </td>
                  {isAdmin ? (
                    <td className="px-4 py-2 text-right">
                      <RowActions
                        editTo="/students/$id"
                        editParams={{ id: s.id }}
                        onDelete={() => handleDelete(s)}
                        deleteDisabled={deleteMutation.isPending}
                      />
                    </td>
                  ) : null}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={isAdmin ? 7 : 6} className="px-4 py-6 text-center text-slate-500">
                  Belum ada data Generus.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
        <span>
          Halaman {page} dari {totalPages} · {total} total
        </span>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={page <= 1}
            onClick={() =>
              void navigate({
                search: { q: q || undefined, status, kelompok, page: Math.max(1, page - 1) },
              })
            }
          >
            Sebelumnya
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={page >= totalPages}
            onClick={() =>
              void navigate({
                search: { q: q || undefined, status, kelompok, page: Math.min(totalPages, page + 1) },
              })
            }
          >
            Berikutnya
          </Button>
        </div>
      </div>
    </div>
  )
}

function StatusPill({ status }: { status: 'active' | 'left' }) {
  if (status === 'active') {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
        Aktif
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">
      Keluar
    </span>
  )
}
