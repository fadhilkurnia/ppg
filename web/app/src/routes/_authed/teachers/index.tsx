import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Plus, Search } from 'lucide-react'
import { z } from 'zod'

import { listTeachers } from '@/api/teachers'
import { useMe } from '@/lib/auth'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'

const PAGE_SIZE = 20

const searchSchema = z.object({
  q: z.string().optional().catch(''),
  status: z.enum(['active', 'retired']).optional().catch(undefined),
  page: z.number().int().min(1).optional().catch(1),
})

export const Route = createFileRoute('/_authed/teachers/')({
  validateSearch: searchSchema,
  component: TeachersPage,
})

function TeachersPage() {
  const navigate = useNavigate({ from: '/teachers/' })
  const { q = '', status, page = 1 } = Route.useSearch()
  const { data: user } = useMe()
  const isAdmin = user?.role === 'admin'

  const { data, isPending } = useQuery({
    queryKey: ['teachers', { q, status, page }],
    queryFn: () =>
      listTeachers({ q, status, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
  })

  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Pengajar</h1>
        {isAdmin ? (
          <Link to="/teachers/new" className="self-start sm:self-auto">
            <Button>
              <Plus size={16} className="mr-1" />
              Tambah Pengajar
            </Button>
          </Link>
        ) : null}
      </div>

      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-center"
        onSubmit={(e) => {
          e.preventDefault()
          const fd = new FormData(e.currentTarget)
          const next = String(fd.get('q') ?? '')
          const nextStatus = String(fd.get('status') ?? '')
          void navigate({
            search: {
              q: next || undefined,
              status: nextStatus === 'active' || nextStatus === 'retired' ? nextStatus : undefined,
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
          <option value="retired">Purna</option>
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
              <th className="hidden px-4 py-2 md:table-cell">Kelompok</th>
              <th className="hidden px-4 py-2 md:table-cell">Daerah</th>
              <th className="px-4 py-2">Status</th>
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
              data.items.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <Link
                      to="/teachers/$id"
                      params={{ id: t.id }}
                      className="text-slate-900 hover:underline"
                    >
                      {t.name}
                    </Link>
                  </td>
                  <td className="hidden px-4 py-2 sm:table-cell">{t.nickname ?? '—'}</td>
                  <td className="hidden px-4 py-2 md:table-cell">{t.kelompok}</td>
                  <td className="hidden px-4 py-2 md:table-cell">{t.daerah}</td>
                  <td className="px-4 py-2">
                    <StatusPill status={t.status} />
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  Belum ada data Pengajar.
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
                search: { q: q || undefined, status, page: Math.max(1, page - 1) },
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
                search: { q: q || undefined, status, page: Math.min(totalPages, page + 1) },
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

function StatusPill({ status }: { status: 'active' | 'retired' }) {
  if (status === 'active') {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
        Aktif
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">
      Purna
    </span>
  )
}
