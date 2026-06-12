import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Pencil, Plus, Trash2 } from 'lucide-react'

import {
  createTingkat,
  deleteTingkat,
  listTingkat,
  updateTingkat,
  type Tingkat,
  type TingkatInput,
} from '@/api/kurikulum'
import { ApiError } from '@/api/client'
import { Button } from '@/components/Button'
import { Field } from '@/components/Field'
import { Input } from '@/components/Input'
import { PageShell } from '@/components/PageShell'
import { useToast } from '@/lib/toast'
import { useConfirm } from '@/lib/confirm'

export function TingkatSection() {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const [editing, setEditing] = useState<Tingkat | null>(null)
  const [creating, setCreating] = useState(false)

  const { data: list = [], isLoading } = useQuery({
    queryKey: ['tingkat'],
    queryFn: listTingkat,
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['tingkat'] })
    qc.invalidateQueries({ queryKey: ['materi-ajar'] })
  }

  const createMut = useMutation({
    mutationFn: (input: TingkatInput) => createTingkat(input),
    onSuccess: () => {
      toast(t('tingkat.addedToast'), 'success')
      setCreating(false)
      invalidate()
    },
    onError: (err) => toast(apiMessage(err, t('tingkat.addFailed')), 'error'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, input }: { id: string; input: TingkatInput }) => updateTingkat(id, input),
    onSuccess: () => {
      toast(t('tingkat.updatedToast'), 'success')
      setEditing(null)
      invalidate()
    },
    onError: (err) => toast(apiMessage(err, t('tingkat.updateFailed')), 'error'),
  })

  const deleteMut = useMutation({
    mutationFn: deleteTingkat,
    onSuccess: () => {
      toast(t('tingkat.deletedToast'), 'success')
      invalidate()
    },
    onError: (err) => toast(apiMessage(err, t('tingkat.deleteFailed')), 'error'),
  })

  const handleDelete = async (tk: Tingkat) => {
    if (await confirm({ message: t('tingkat.deleteConfirm', { nama: tk.nama }), danger: true })) {
      deleteMut.mutate(tk.id)
    }
  }

  const header = (
    <div className="flex items-center justify-between">
      <div>
        <h2 className="text-lg font-semibold">{t('tingkat.title')}</h2>
        <p className="text-sm text-slate-500">
          {t('tingkat.subtitle')}
        </p>
      </div>
      {!creating ? (
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus size={16} className="mr-1" /> {t('tingkat.add')}
        </Button>
      ) : null}
    </div>
  )

  return (
    <PageShell header={header}>
      <div className="space-y-4">

      {creating ? (
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">{t('tingkat.newSection')}</h3>
          <TingkatForm
            pending={createMut.isPending}
            error={createMut.error}
            onSubmit={(input) => createMut.mutate(input)}
            onCancel={() => setCreating(false)}
          />
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2">{t('tingkat.cols.nama')}</th>
              <th className="px-4 py-2 w-20">{t('tingkat.cols.umur')}</th>
              <th className="px-4 py-2 w-24">{t('tingkat.cols.urutan')}</th>
              <th className="px-4 py-2 w-24 text-right">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                  {t('common.loading')}
                </td>
              </tr>
            ) : list.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                  {t('tingkat.empty')}
                </td>
              </tr>
            ) : (
              list.map((tk) =>
                editing?.id === tk.id ? (
                  <tr key={tk.id} className="bg-slate-50">
                    <td colSpan={4} className="px-4 py-3">
                      <TingkatForm
                        initial={tk}
                        pending={updateMut.isPending}
                        error={updateMut.error}
                        onSubmit={(input) => updateMut.mutate({ id: tk.id, input })}
                        onCancel={() => setEditing(null)}
                      />
                    </td>
                  </tr>
                ) : (
                  <tr key={tk.id}>
                    <td className="px-4 py-2 font-medium text-slate-900">{tk.nama}</td>
                    <td className="px-4 py-2 text-slate-600">
                      {tk.umur != null ? t('tingkat.yearsShort', { count: tk.umur }) : '—'}
                    </td>
                    <td className="px-4 py-2 text-slate-600">{tk.urutan}</td>
                    <td className="px-4 py-2 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setEditing(tk)}
                          className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                          aria-label={t('tingkat.editAria')}
                          title={t('tingkat.editAria')}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(tk)}
                          disabled={deleteMut.isPending}
                          className="rounded-md p-1.5 text-slate-500 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label={t('tingkat.deleteAria')}
                          title={t('tingkat.deleteAria')}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ),
              )
            )}
          </tbody>
        </table>
      </div>
      </div>
    </PageShell>
  )
}

type FormValues = {
  nama: string
  urutan: number | string
  umur?: number | ''
}

function TingkatForm({
  initial,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  initial?: Tingkat
  pending?: boolean
  error?: unknown
  onSubmit: (input: TingkatInput) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()

  const schema = useMemo(
    () =>
      z.object({
        nama: z.string().min(1, t('tingkat.form.errRequired')).max(100),
        urutan: z.coerce.number().int(t('tingkat.form.errInt')).gte(0).lte(10000),
        umur: z
          .union([z.literal(''), z.coerce.number().int(t('tingkat.form.errInt')).gte(0).lte(120)])
          .optional(),
      }),
    [t],
  )

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      nama: initial?.nama ?? '',
      urutan: initial?.urutan ?? 0,
      umur: initial?.umur ?? '',
    },
  })

  const apiError = error instanceof ApiError ? error.message : null

  return (
    <form
      onSubmit={handleSubmit((v) =>
        onSubmit({
          nama: v.nama,
          urutan: Number(v.urutan),
          umur: v.umur === '' || v.umur === undefined ? null : Number(v.umur),
        }),
      )}
      className="space-y-3"
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_120px_120px]">
        <Field label={t('tingkat.form.nama')} htmlFor="nama" error={errors.nama?.message}>
          <Input id="nama" {...register('nama')} />
        </Field>
        <Field label={t('tingkat.form.umur')} htmlFor="umur" error={errors.umur?.message}>
          <Input id="umur" type="number" min={0} max={120} placeholder={t('tingkat.form.umurPh')} {...register('umur')} />
        </Field>
        <Field label={t('tingkat.form.urutan')} htmlFor="urutan" error={errors.urutan?.message}>
          <Input id="urutan" type="number" min={0} {...register('urutan')} />
        </Field>
      </div>
      {apiError ? <p className="text-sm text-red-600">{apiError}</p> : null}
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? t('common.saving') : initial ? t('tingkat.form.submitSave') : t('tingkat.form.submitAdd')}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  )
}

function apiMessage(err: unknown, fallback: string) {
  if (err instanceof ApiError) return err.message || fallback
  return fallback
}
