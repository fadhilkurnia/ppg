import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileSpreadsheet, Plus, Search } from 'lucide-react'
import { z } from 'zod'

import {
  createStudent,
  deleteStudent,
  getStudent,
  listStudents,
  updateStudent,
} from '@/api/students'
import { STUDENT_KELOMPOKS, type Student } from '@/api/types'
import { useMe } from '@/lib/auth'
import { ageInYears } from '@/lib/age'
import { BulkImportExportPanel } from '@/components/BulkImportExportPanel'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import { Modal } from '@/components/Modal'
import { RowActions } from '@/components/RowActions'
import { StudentDetail } from '@/components/StudentDetail'
import { StudentForm } from '@/components/StudentForm'
import { useTranslation } from '@/i18n'
import { useStudentStatusLabel } from '@/i18n/labels'

const PAGE_SIZE = 20

const searchSchema = z.object({
  q: z.string().optional().catch(''),
  status: z.enum(['active', 'left']).optional().catch(undefined),
  kelompok: z.enum(STUDENT_KELOMPOKS).optional().catch(undefined),
  page: z.number().int().min(1).optional().catch(1),
  view: z.string().optional().catch(undefined),
  edit: z.string().optional().catch(undefined),
  new: z.boolean().optional().catch(undefined),
  bulk: z.boolean().optional().catch(undefined),
})

type SearchState = z.infer<typeof searchSchema>

export const Route = createFileRoute('/_authed/students/')({
  validateSearch: searchSchema,
  component: StudentsPage,
})

function StudentsPage() {
  const navigate = useNavigate({ from: '/students/' })
  const search = Route.useSearch()
  const { q = '', status, kelompok, page = 1, view, edit, new: isNew, bulk: isBulk } = search
  const { data: user } = useMe()
  const isAdmin = user?.role === 'admin'
  const { t } = useTranslation()

  const filterSearch: SearchState = { q, status, kelompok, page }

  const goTo = (next: Partial<SearchState>) =>
    void navigate({
      search: { ...filterSearch, ...next },
    })

  const close = () =>
    goTo({ view: undefined, edit: undefined, new: undefined, bulk: undefined })

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
    if (confirm(t('students.confirmDelete', { name: s.name }))) {
      deleteMutation.mutate(s.id)
    }
  }

  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">{t('students.heading')}</h1>
        <div className="flex flex-wrap gap-2 self-start sm:self-auto">
          <Button variant="secondary" onClick={() => goTo({ bulk: true })}>
            <FileSpreadsheet size={16} className="mr-1" />
            {t('bulk.importExportBtn')}
          </Button>
          {isAdmin ? (
            <Button onClick={() => goTo({ new: true })}>
              <Plus size={16} className="mr-1" />
              {t('students.addBtn')}
            </Button>
          ) : null}
        </div>
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
          <Input
            name="q"
            defaultValue={q}
            placeholder={t('students.searchPlaceholder')}
            className="pl-9"
          />
        </div>
        <select
          name="status"
          defaultValue={status ?? ''}
          className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
        >
          <option value="">{t('students.allStatus')}</option>
          <option value="active">{t('status.active')}</option>
          <option value="left">{t('status.left')}</option>
        </select>
        <select
          name="kelompok"
          defaultValue={kelompok ?? ''}
          className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
        >
          <option value="">{t('students.allKelompok')}</option>
          {STUDENT_KELOMPOKS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <Button type="submit" variant="secondary" size="md">
          {t('common.apply')}
        </Button>
      </form>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2">{t('students.colName')}</th>
              <th className="hidden px-4 py-2 sm:table-cell">{t('students.colNickname')}</th>
              <th className="hidden px-4 py-2 sm:table-cell">{t('students.colGender')}</th>
              <th className="hidden px-4 py-2 sm:table-cell">{t('students.colAge')}</th>
              <th className="hidden px-4 py-2 md:table-cell">{t('students.colLevel')}</th>
              <th className="hidden px-4 py-2 md:table-cell">{t('students.colKelompok')}</th>
              <th className="px-4 py-2">{t('students.colStatus')}</th>
              {isAdmin ? <th className="px-4 py-2 text-right">{t('students.colActions')}</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isPending ? (
              <tr>
                <td colSpan={isAdmin ? 8 : 7} className="px-4 py-6 text-center text-slate-500">
                  {t('common.loading')}
                </td>
              </tr>
            ) : data && data.items.length > 0 ? (
              data.items.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      onClick={() => goTo({ view: s.id })}
                      className="text-left text-slate-900 hover:underline"
                    >
                      {s.name}
                    </button>
                  </td>
                  <td className="hidden px-4 py-2 sm:table-cell">{s.nickname ?? '—'}</td>
                  <td className="hidden px-4 py-2 sm:table-cell">
                    {s.gender === 'male'
                      ? t('students.genderShortMale')
                      : t('students.genderShortFemale')}
                  </td>
                  <td className="hidden px-4 py-2 sm:table-cell">
                    {(() => {
                      const age = ageInYears(s.dateOfBirth)
                      return age === null ? '—' : age
                    })()}
                  </td>
                  <td className="hidden px-4 py-2 md:table-cell">{s.level}</td>
                  <td className="hidden px-4 py-2 md:table-cell">{s.kelompok}</td>
                  <td className="px-4 py-2">
                    <StatusPill status={s.status} />
                  </td>
                  {isAdmin ? (
                    <td className="px-4 py-2 text-right">
                      <RowActions
                        onEdit={() => goTo({ edit: s.id })}
                        onDelete={() => handleDelete(s)}
                        deleteDisabled={deleteMutation.isPending}
                      />
                    </td>
                  ) : null}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={isAdmin ? 8 : 7} className="px-4 py-6 text-center text-slate-500">
                  {t('students.empty')}
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

      <ViewModal id={view} open={!!view && !edit} onClose={close} isAdmin={isAdmin} onEdit={(id) => goTo({ view: undefined, edit: id })} />
      <EditModal id={edit} open={!!edit && isAdmin} onClose={close} onSaved={(s) => goTo({ edit: undefined, view: s.id })} />
      <NewModal open={!!isNew && isAdmin} onClose={close} />
      <Modal open={!!isBulk} onClose={close} size="xl" title={t('students.bulkTitle')}>
        <BulkImportExportPanel
          entity="students"
          isAdmin={isAdmin}
          invalidateKey={['students']}
          exportParams={{ q, status, kelompok }}
        />
      </Modal>
    </div>
  )
}

function StatusPill({ status }: { status: 'active' | 'left' }) {
  const label = useStudentStatusLabel()
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
    queryKey: ['students', id],
    queryFn: () => getStudent(id as string),
    enabled: open && !!id,
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={query.data?.name ?? t('students.detailTitle')}
    >
      {query.isPending ? (
        <p className="text-slate-500">{t('common.loading')}</p>
      ) : query.isError || !query.data ? (
        <p className="text-red-600">{t('common.loadError')}</p>
      ) : (
        <>
          <StudentDetail student={query.data} />
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
  onSaved: (student: Student) => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const query = useQuery({
    queryKey: ['students', id],
    queryFn: () => getStudent(id as string),
    enabled: open && !!id,
  })

  const mutation = useMutation({
    mutationFn: (input: Parameters<typeof updateStudent>[1]) =>
      updateStudent(id as string, input),
    onSuccess: async (saved) => {
      await qc.invalidateQueries({ queryKey: ['students'] })
      onSaved(saved)
    },
  })

  return (
    <Modal open={open} onClose={onClose} size="xl" title={t('students.editTitle')}>
      {query.isPending ? (
        <p className="text-slate-500">{t('common.loading')}</p>
      ) : query.isError || !query.data ? (
        <p className="text-red-600">{t('common.loadError')}</p>
      ) : (
        <StudentForm
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
    mutationFn: createStudent,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['students'] })
      onClose()
    },
  })

  return (
    <Modal open={open} onClose={onClose} size="xl" title={t('students.newTitle')}>
      <StudentForm
        submitLabel={t('common.save')}
        pending={mutation.isPending}
        error={mutation.error}
        onSubmit={(input) => mutation.mutate(input)}
        onCancel={onClose}
      />
    </Modal>
  )
}
