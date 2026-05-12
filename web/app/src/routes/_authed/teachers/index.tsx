import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileSpreadsheet, Plus, Search } from 'lucide-react'
import { z } from 'zod'

import {
  createTeacher,
  deleteTeacher,
  getTeacher,
  listTeachers,
  updateTeacher,
} from '@/api/teachers'
import type { Teacher } from '@/api/types'
import { useMe } from '@/lib/auth'
import { BulkImportExportPanel } from '@/components/BulkImportExportPanel'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import { Modal } from '@/components/Modal'
import { RowActions } from '@/components/RowActions'
import { TeacherDetail } from '@/components/TeacherDetail'
import { TeacherForm } from '@/components/TeacherForm'

const PAGE_SIZE = 20

const searchSchema = z.object({
  q: z.string().optional().catch(''),
  status: z.enum(['active', 'retired']).optional().catch(undefined),
  page: z.number().int().min(1).optional().catch(1),
  view: z.string().optional().catch(undefined),
  edit: z.string().optional().catch(undefined),
  new: z.boolean().optional().catch(undefined),
  bulk: z.boolean().optional().catch(undefined),
})

type SearchState = z.infer<typeof searchSchema>

export const Route = createFileRoute('/_authed/teachers/')({
  validateSearch: searchSchema,
  component: TeachersPage,
})

function TeachersPage() {
  const navigate = useNavigate({ from: '/teachers/' })
  const search = Route.useSearch()
  const { q = '', status, page = 1, view, edit, new: isNew, bulk: isBulk } = search
  const { data: user } = useMe()
  const isAdmin = user?.role === 'admin'

  const filterSearch: SearchState = { q, status, page }
  const goTo = (next: Partial<SearchState>) =>
    void navigate({ search: { ...filterSearch, ...next } })
  const close = () =>
    goTo({ view: undefined, edit: undefined, new: undefined, bulk: undefined })

  const { data, isPending } = useQuery({
    queryKey: ['teachers', { q, status, page }],
    queryFn: () =>
      listTeachers({ q, status, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
  })

  const qc = useQueryClient()
  const deleteMutation = useMutation({
    mutationFn: deleteTeacher,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teachers'] }),
  })

  const handleDelete = (t: Teacher) => {
    if (confirm(`Hapus ${t.name}? Tindakan ini tidak dapat dibatalkan.`)) {
      deleteMutation.mutate(t.id)
    }
  }

  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Pengajar</h1>
        <div className="flex flex-wrap gap-2 self-start sm:self-auto">
          <Button variant="secondary" onClick={() => goTo({ bulk: true })}>
            <FileSpreadsheet size={16} className="mr-1" />
            Impor / Ekspor
          </Button>
          {isAdmin ? (
            <Button onClick={() => goTo({ new: true })}>
              <Plus size={16} className="mr-1" />
              Tambah Pengajar
            </Button>
          ) : null}
        </div>
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
              status:
                nextStatus === 'active' || nextStatus === 'retired' ? nextStatus : undefined,
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
              {isAdmin ? <th className="px-4 py-2 text-right">Aksi</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isPending ? (
              <tr>
                <td colSpan={isAdmin ? 6 : 5} className="px-4 py-6 text-center text-slate-500">
                  Memuat…
                </td>
              </tr>
            ) : data && data.items.length > 0 ? (
              data.items.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      onClick={() => goTo({ view: t.id })}
                      className="text-left text-slate-900 hover:underline"
                    >
                      {t.name}
                    </button>
                  </td>
                  <td className="hidden px-4 py-2 sm:table-cell">{t.nickname ?? '—'}</td>
                  <td className="hidden px-4 py-2 md:table-cell">{t.kelompok}</td>
                  <td className="hidden px-4 py-2 md:table-cell">{t.daerah}</td>
                  <td className="px-4 py-2">
                    <StatusPill status={t.status} />
                  </td>
                  {isAdmin ? (
                    <td className="px-4 py-2 text-right">
                      <RowActions
                        onEdit={() => goTo({ edit: t.id })}
                        onDelete={() => handleDelete(t)}
                        deleteDisabled={deleteMutation.isPending}
                      />
                    </td>
                  ) : null}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={isAdmin ? 6 : 5} className="px-4 py-6 text-center text-slate-500">
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
            onClick={() => goTo({ page: Math.max(1, page - 1) })}
          >
            Sebelumnya
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => goTo({ page: Math.min(totalPages, page + 1) })}
          >
            Berikutnya
          </Button>
        </div>
      </div>

      <ViewModal
        id={view}
        open={!!view && !edit}
        onClose={close}
        isAdmin={isAdmin}
        onEdit={(id) => goTo({ view: undefined, edit: id })}
      />
      <EditModal
        id={edit}
        open={!!edit && isAdmin}
        onClose={close}
        onSaved={(t) => goTo({ edit: undefined, view: t.id })}
      />
      <NewModal open={!!isNew && isAdmin} onClose={close} />
      <Modal open={!!isBulk} onClose={close} size="xl" title="Impor / Ekspor Pengajar">
        <BulkImportExportPanel
          entity="teachers"
          isAdmin={isAdmin}
          invalidateKey={['teachers']}
          exportParams={{ q, status }}
        />
      </Modal>
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

/* ---------- modals ---------- */

function ViewModal({
  id,
  open,
  onClose,
  isAdmin,
  onEdit,
}: {
  id: string | undefined
  open: boolean
  onClose: () => void
  isAdmin: boolean
  onEdit: (id: string) => void
}) {
  const query = useQuery({
    queryKey: ['teachers', id],
    queryFn: () => getTeacher(id as string),
    enabled: open && !!id,
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={query.data?.name ?? 'Detail Pengajar'}
    >
      {query.isPending ? (
        <p className="text-slate-500">Memuat…</p>
      ) : query.isError || !query.data ? (
        <p className="text-red-600">Gagal memuat data.</p>
      ) : (
        <>
          <TeacherDetail teacher={query.data} />
          {isAdmin ? (
            <div className="mt-6 flex justify-end gap-2 border-t border-slate-200 pt-4">
              <Button variant="secondary" onClick={onClose}>
                Tutup
              </Button>
              <Button onClick={() => onEdit(query.data!.id)}>Ubah</Button>
            </div>
          ) : null}
        </>
      )}
    </Modal>
  )
}

function EditModal({
  id,
  open,
  onClose,
  onSaved,
}: {
  id: string | undefined
  open: boolean
  onClose: () => void
  onSaved: (teacher: Teacher) => void
}) {
  const qc = useQueryClient()
  const query = useQuery({
    queryKey: ['teachers', id],
    queryFn: () => getTeacher(id as string),
    enabled: open && !!id,
  })

  const mutation = useMutation({
    mutationFn: (input: Parameters<typeof updateTeacher>[1]) =>
      updateTeacher(id as string, input),
    onSuccess: async (saved) => {
      await qc.invalidateQueries({ queryKey: ['teachers'] })
      onSaved(saved)
    },
  })

  return (
    <Modal open={open} onClose={onClose} size="xl" title="Ubah Pengajar">
      {query.isPending ? (
        <p className="text-slate-500">Memuat…</p>
      ) : query.isError || !query.data ? (
        <p className="text-red-600">Gagal memuat data.</p>
      ) : (
        <TeacherForm
          initial={query.data}
          submitLabel="Simpan"
          pending={mutation.isPending}
          error={mutation.error}
          onSubmit={(input) => mutation.mutate(input)}
          onCancel={onClose}
        />
      )}
    </Modal>
  )
}

function NewModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const mutation = useMutation({
    mutationFn: createTeacher,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['teachers'] })
      onClose()
    },
  })

  return (
    <Modal open={open} onClose={onClose} size="xl" title="Tambah Pengajar">
      <TeacherForm
        submitLabel="Simpan"
        pending={mutation.isPending}
        error={mutation.error}
        onSubmit={(input) => mutation.mutate(input)}
        onCancel={onClose}
      />
    </Modal>
  )
}
