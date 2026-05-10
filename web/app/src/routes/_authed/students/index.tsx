import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Plus, Search } from 'lucide-react'
import { z } from 'zod'

import { listStudents } from '@/api/students'
import { useMe } from '@/lib/auth'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'

const PAGE_SIZE = 20

const searchSchema = z.object({
  q: z.string().optional().catch(''),
  page: z.number().int().min(1).optional().catch(1),
})

export const Route = createFileRoute('/_authed/students/')({
  validateSearch: searchSchema,
  component: StudentsPage,
})

function StudentsPage() {
  const navigate = useNavigate({ from: '/students/' })
  const { q = '', page = 1 } = Route.useSearch()
  const { data: user } = useMe()
  const isAdmin = user?.role === 'admin'

  const { data, isPending } = useQuery({
    queryKey: ['students', { q, page }],
    queryFn: () => listStudents({ q, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
  })

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
        className="relative max-w-md"
        onSubmit={(e) => {
          e.preventDefault()
          const fd = new FormData(e.currentTarget)
          const next = String(fd.get('q') ?? '')
          void navigate({ search: { q: next || undefined, page: 1 } })
        }}
      >
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <Input name="q" defaultValue={q} placeholder="Cari berdasarkan nama atau ID" className="pl-9" />
      </form>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2">ID Generus</th>
              <th className="px-4 py-2">Nama</th>
              <th className="hidden px-4 py-2 sm:table-cell">Jenis Kelamin</th>
              <th className="hidden px-4 py-2 md:table-cell">Orang Tua</th>
              <th className="hidden px-4 py-2 md:table-cell">Telepon</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isPending ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  Memuat…
                </td>
              </tr>
            ) : data && data.items.length > 0 ? (
              data.items.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-mono text-xs">{s.studentId}</td>
                  <td className="px-4 py-2">
                    <Link
                      to="/students/$id"
                      params={{ id: s.id }}
                      className="text-slate-900 hover:underline"
                    >
                      {s.name}
                    </Link>
                  </td>
                  <td className="hidden px-4 py-2 sm:table-cell">
                    {s.gender === 'male' ? 'Laki-laki' : 'Perempuan'}
                  </td>
                  <td className="hidden px-4 py-2 md:table-cell">{s.parentName}</td>
                  <td className="hidden px-4 py-2 md:table-cell">{s.parentPhone}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
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
              void navigate({ search: { q: q || undefined, page: Math.max(1, page - 1) } })
            }
          >
            Sebelumnya
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={page >= totalPages}
            onClick={() =>
              void navigate({ search: { q: q || undefined, page: Math.min(totalPages, page + 1) } })
            }
          >
            Berikutnya
          </Button>
        </div>
      </div>
    </div>
  )
}
