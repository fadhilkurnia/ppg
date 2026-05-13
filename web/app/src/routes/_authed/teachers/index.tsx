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
import { useTranslation } from '@/i18n'
import { useTeacherStatusLabel } from '@/i18n/labels'

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
  const { t } = useTranslation()

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

  const handleDelete = (te: Teacher) => {
    if (confirm(t('teachers.confirmDelete', { name: te.name }))) {
      deleteMutation.mutate(te.id)
    }
  }

  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">{t('teachers.heading')}</h1>
        <div className="flex flex-wrap gap-2 self-start sm:self-auto">
          <Button variant="secondary" onClick={() => goTo({ bulk: true })}>
            <FileSpreadsheet size={16} className="mr-1" />
            {t('bulk.importExportBtn')}
          </Button>
          {isAdmin ? (
            <Button onClick={() => goTo({ new: true })}>
              <Plus size={16} className="mr-1" />
              {t('teachers.addBtn')}
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
          <Input
            name="q"
            defaultValue={q}
            placeholder={t('teachers.searchPlaceholder')}
            className="pl-9"
          />
        </div>
        <select
          name="status"
          defaultValue={status ?? ''}
          className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
        >
          <option value="">{t('teachers.allStatus')}</option>
          <option value="active">{t('status.active')}</option>
          <option value="retired">{t('status.retired')}</option>
        </select>
        <Button type="submit" variant="secondary" size="md">
          {t('common.apply')}
        </Button>
      </form>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2">{t('teachers.colName')}</th>
              <th className="hidden px-4 py-2 sm:table-cell">{t('teachers.colNickname')}</th>
              <th className="hidden px-4 py-2 md:table-cell">{t('teachers.colKelompok')}</th>
              <th className="hidden px-4 py-2 md:table-cell">{t('teachers.colDaerah')}</th>
              <th className="px-4 py-2">{t('teachers.colStatus')}</th>
              {isAdmin ? <th className="px-4 py-2 text-right">{t('teachers.colActions')}</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isPending ? (
              <tr>
                <td colSpan={isAdmin ? 6 : 5} className="px-4 py-6 text-center text-slate-500">
                  {t('common.loading')}
                </td>
              </tr>
            ) : data && data.items.length > 0 ? (
              data.items.map((te) => (
                <tr key={te.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      onClick={() => goTo({ view: te.id })}
                      className="text-left text-slate-900 hover:underline"
                    >
                      {te.name}
                    </button>
                  </td>
                  <td className="hidden px-4 py-2 sm:table-cell">{te.nickname ?? '—'}</td>
                  <td className="hidden px-4 py-2 md:table-cell">{te.kelompok}</td>
                  <td className="hidden px-4 py-2 md:table-cell">{te.daerah}</td>
                  <td className="px-4 py-2">
                    <StatusPill status={te.status} />
                  </td>
                  {isAdmin ? (
                    <td className="px-4 py-2 text-right">
                      <RowActions
                        onEdit={() => goTo({ edit: te.id })}
                        onDelete={() => handleDelete(te)}
                        deleteDisabled={deleteMutation.isPending}
                      />
                    </td>
                  ) : null}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={isAdmin ? 6 : 5} className="px-4 py-6 text-center text-slate-500">
                  {t('teachers.empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
        <span>
          {t('common.pageStatus', { page, total: totalPages, count: total })}
        </span>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={page <= 1}
            onClick={() => goTo({ page: Math.max(1, page - 1) })}
          >
            {t('common.prev')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => goTo({ page: Math.min(totalPages, page + 1) })}
          >
            {t('common.next')}
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
        onSaved={(te) => goTo({ edit: undefined, view: te.id })}
      />
      <NewModal open={!!isNew && isAdmin} onClose={close} />
      <Modal open={!!isBulk} onClose={close} size="xl" title={t('teachers.bulkTitle')}>
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
  const label = useTeacherStatusLabel()
  if (status === 'active') {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
        {label(status)}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">
      {label(status)}
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
  const { t } = useTranslation()
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
      title={query.data?.name ?? t('teachers.detailTitle')}
    >
      {query.isPending ? (
        <p className="text-slate-500">{t('common.loading')}</p>
      ) : query.isError || !query.data ? (
        <p className="text-red-600">{t('common.loadError')}</p>
      ) : (
        <>
          <TeacherDetail teacher={query.data} />
          {isAdmin ? (
            <div className="mt-6 flex justify-end gap-2 border-t border-slate-200 pt-4">
              <Button variant="secondary" onClick={onClose}>
                {t('common.close')}
              </Button>
              <Button onClick={() => onEdit(query.data!.id)}>{t('common.edit')}</Button>
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
  const { t } = useTranslation()
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
    <Modal open={open} onClose={onClose} size="xl" title={t('teachers.editTitle')}>
      {query.isPending ? (
        <p className="text-slate-500">{t('common.loading')}</p>
      ) : query.isError || !query.data ? (
        <p className="text-red-600">{t('common.loadError')}</p>
      ) : (
        <TeacherForm
          initial={query.data}
          submitLabel={t('common.save')}
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
  const { t } = useTranslation()
  const qc = useQueryClient()
  const mutation = useMutation({
    mutationFn: createTeacher,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['teachers'] })
      onClose()
    },
  })

  return (
    <Modal open={open} onClose={onClose} size="xl" title={t('teachers.newTitle')}>
      <TeacherForm
        submitLabel={t('common.save')}
        pending={mutation.isPending}
        error={mutation.error}
        onSubmit={(input) => mutation.mutate(input)}
        onCancel={onClose}
      />
    </Modal>
  )
}
