import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { z } from 'zod'

import {
  createAttendance,
  deleteAttendance,
  getAttendance,
  listAttendances,
  updateAttendance,
} from '@/api/attendances'
import { listStudents } from '@/api/students'
import { listTeachers } from '@/api/teachers'
import {
  ATTENDANCE_STATUSES,
  ATTENDANCE_STATUS_LABELS,
  type Attendance,
  type AttendanceStatus,
} from '@/api/types'
import { useMe } from '@/lib/auth'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import { Modal } from '@/components/Modal'
import { RowActions } from '@/components/RowActions'
import { AttendanceDetail } from '@/components/AttendanceDetail'
import { AttendanceForm } from '@/components/AttendanceForm'

const PAGE_SIZE = 25

const searchSchema = z.object({
  dateFrom: z.string().optional().catch(undefined),
  dateTo: z.string().optional().catch(undefined),
  teacherId: z.string().optional().catch(undefined),
  studentId: z.string().optional().catch(undefined),
  status: z.enum(ATTENDANCE_STATUSES).optional().catch(undefined),
  page: z.number().int().min(1).optional().catch(1),
  view: z.string().optional().catch(undefined),
  edit: z.string().optional().catch(undefined),
  new: z.boolean().optional().catch(undefined),
})

type SearchState = z.infer<typeof searchSchema>

export const Route = createFileRoute('/_authed/sessions')({
  validateSearch: searchSchema,
  component: SessionsPage,
})

function SessionsPage() {
  const navigate = useNavigate({ from: '/sessions' })
  const search = Route.useSearch()
  const {
    dateFrom,
    dateTo,
    teacherId,
    studentId,
    status,
    page = 1,
    view,
    edit,
    new: isNew,
  } = search
  const { data: user } = useMe()
  const isAdmin = user?.role === 'admin'

  const filterSearch: SearchState = { dateFrom, dateTo, teacherId, studentId, status, page }
  const goTo = (next: Partial<SearchState>) =>
    void navigate({ search: { ...filterSearch, ...next } })
  const close = () => goTo({ view: undefined, edit: undefined, new: undefined })

  const { data, isPending } = useQuery({
    queryKey: ['attendances', { dateFrom, dateTo, teacherId, studentId, status, page }],
    queryFn: () =>
      listAttendances({
        dateFrom,
        dateTo,
        teacherId,
        studentId,
        status,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      }),
  })

  // For filter dropdowns
  const teachersQ = useQuery({
    queryKey: ['teachers', 'all-for-filter'],
    queryFn: () => listTeachers({ limit: 200 }),
    staleTime: 5 * 60_000,
  })
  const studentsQ = useQuery({
    queryKey: ['students', 'all-for-filter'],
    queryFn: () => listStudents({ limit: 200 }),
    staleTime: 5 * 60_000,
  })

  const qc = useQueryClient()
  const deleteMutation = useMutation({
    mutationFn: deleteAttendance,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attendances'] }),
  })
  const handleDelete = (a: Attendance) => {
    const label = `${a.date.slice(0, 10)} — ${a.studentName} · ${a.teacherName}`
    if (confirm(`Hapus pengajian ${label}?\nTindakan ini tidak dapat dibatalkan.`)) {
      deleteMutation.mutate(a.id)
    }
  }

  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Pengajian</h1>
        {isAdmin ? (
          <Button onClick={() => goTo({ new: true })} className="self-start sm:self-auto">
            <Plus size={16} className="mr-1" />
            Tambah Pengajian
          </Button>
        ) : null}
      </div>

      <form
        className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6"
        onSubmit={(e) => {
          e.preventDefault()
          const fd = new FormData(e.currentTarget)
          const next: SearchState = {
            dateFrom: (String(fd.get('dateFrom') ?? '') || undefined) as string | undefined,
            dateTo: (String(fd.get('dateTo') ?? '') || undefined) as string | undefined,
            teacherId: (String(fd.get('teacherId') ?? '') || undefined) as string | undefined,
            studentId: (String(fd.get('studentId') ?? '') || undefined) as string | undefined,
            status: (() => {
              const v = String(fd.get('status') ?? '')
              return ATTENDANCE_STATUSES.includes(v as AttendanceStatus)
                ? (v as AttendanceStatus)
                : undefined
            })(),
            page: 1,
          }
          void navigate({ search: next })
        }}
      >
        <div>
          <label className="block text-xs text-slate-500">Dari</label>
          <Input type="date" name="dateFrom" defaultValue={dateFrom ?? ''} />
        </div>
        <div>
          <label className="block text-xs text-slate-500">Sampai</label>
          <Input type="date" name="dateTo" defaultValue={dateTo ?? ''} />
        </div>
        <div>
          <label className="block text-xs text-slate-500">Pengajar</label>
          <SelectFilter name="teacherId" defaultValue={teacherId ?? ''}>
            <option value="">Semua</option>
            {teachersQ.data?.items.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </SelectFilter>
        </div>
        <div>
          <label className="block text-xs text-slate-500">Generus</label>
          <SelectFilter name="studentId" defaultValue={studentId ?? ''}>
            <option value="">Semua</option>
            {studentsQ.data?.items.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </SelectFilter>
        </div>
        <div>
          <label className="block text-xs text-slate-500">Status</label>
          <SelectFilter name="status" defaultValue={status ?? ''}>
            <option value="">Semua</option>
            {ATTENDANCE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {ATTENDANCE_STATUS_LABELS[s]}
              </option>
            ))}
          </SelectFilter>
        </div>
        <div className="flex items-end">
          <Button type="submit" variant="secondary" size="md" className="w-full">
            Terapkan
          </Button>
        </div>
      </form>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2">Tanggal</th>
              <th className="px-4 py-2">Generus</th>
              <th className="hidden px-4 py-2 sm:table-cell">Pengajar</th>
              <th className="hidden px-4 py-2 md:table-cell">Durasi</th>
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
              data.items.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-mono text-xs">{a.date.slice(0, 10)}</td>
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      onClick={() => goTo({ view: a.id })}
                      className="text-left text-slate-900 hover:underline"
                    >
                      {a.studentName}
                    </button>
                  </td>
                  <td className="hidden px-4 py-2 sm:table-cell">{a.teacherName}</td>
                  <td className="hidden px-4 py-2 md:table-cell">
                    {a.durationMin != null ? `${a.durationMin} min` : '—'}
                  </td>
                  <td className="px-4 py-2">
                    <StatusPill status={a.status} />
                  </td>
                  {isAdmin ? (
                    <td className="px-4 py-2 text-right">
                      <RowActions
                        onEdit={() => goTo({ edit: a.id })}
                        onDelete={() => handleDelete(a)}
                        deleteDisabled={deleteMutation.isPending}
                      />
                    </td>
                  ) : null}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={isAdmin ? 6 : 5} className="px-4 py-6 text-center text-slate-500">
                  Belum ada data pengajian untuk filter ini.
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
        onSaved={(att) => goTo({ edit: undefined, view: att.id })}
      />
      <NewModal open={!!isNew && isAdmin} onClose={close} />
    </div>
  )
}

function SelectFilter(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
    />
  )
}

function StatusPill({ status }: { status: AttendanceStatus }) {
  const label = ATTENDANCE_STATUS_LABELS[status]
  if (status === 'hadir') {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
        {label}
      </span>
    )
  }
  if (status === 'by_vn') {
    return (
      <span className="inline-flex items-center rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800">
        {label}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
      {label}
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
    queryKey: ['attendances', id],
    queryFn: () => getAttendance(id as string),
    enabled: open && !!id,
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={
        query.data
          ? `Pengajian — ${query.data.studentName} (${query.data.date.slice(0, 10)})`
          : 'Detail Pengajian'
      }
    >
      {query.isPending ? (
        <p className="text-slate-500">Memuat…</p>
      ) : query.isError || !query.data ? (
        <p className="text-red-600">Gagal memuat data.</p>
      ) : (
        <>
          <AttendanceDetail attendance={query.data} />
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
  onSaved: (att: Attendance) => void
}) {
  const qc = useQueryClient()
  const query = useQuery({
    queryKey: ['attendances', id],
    queryFn: () => getAttendance(id as string),
    enabled: open && !!id,
  })
  const mutation = useMutation({
    mutationFn: (input: Parameters<typeof updateAttendance>[1]) =>
      updateAttendance(id as string, input),
    onSuccess: async (saved) => {
      await qc.invalidateQueries({ queryKey: ['attendances'] })
      onSaved(saved)
    },
  })

  return (
    <Modal open={open} onClose={onClose} size="xl" title="Ubah Pengajian">
      {query.isPending ? (
        <p className="text-slate-500">Memuat…</p>
      ) : query.isError || !query.data ? (
        <p className="text-red-600">Gagal memuat data.</p>
      ) : (
        <AttendanceForm
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
    mutationFn: createAttendance,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['attendances'] })
      onClose()
    },
  })

  return (
    <Modal open={open} onClose={onClose} size="xl" title="Tambah Pengajian">
      <AttendanceForm
        submitLabel="Simpan"
        pending={mutation.isPending}
        error={mutation.error}
        onSubmit={(input) => mutation.mutate(input)}
        onCancel={onClose}
      />
    </Modal>
  )
}
