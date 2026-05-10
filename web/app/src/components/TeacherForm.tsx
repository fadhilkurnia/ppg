import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import type { Teacher, TeacherInput } from '@/api/types'
import { ApiError } from '@/api/client'
import { Button } from './Button'
import { Input } from './Input'
import { Field } from './Field'

const isoDateOrEmpty = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Gunakan format YYYY-MM-DD')
  .optional()
  .or(z.literal(''))

const schema = z.object({
  name: z.string().min(1, 'Wajib diisi').max(200),
  nickname: z.string().max(200).optional().or(z.literal('')),
  kelompok: z.string().min(1, 'Wajib diisi').max(200),
  desa: z.string().min(1, 'Wajib diisi').max(200),
  daerah: z.string().min(1, 'Wajib diisi').max(200),
  joinedAt: isoDateOrEmpty,
  retiredAt: isoDateOrEmpty,
  status: z.enum(['active', 'retired']),
  notes: z.string().max(2000).optional().or(z.literal('')),
})

type FormValues = z.infer<typeof schema>

type Props = {
  initial?: Teacher
  submitLabel: string
  pending?: boolean
  error?: unknown
  onSubmit: (input: TeacherInput) => void
  onCancel?: () => void
}

export function TeacherForm({ initial, submitLabel, pending, error, onSubmit, onCancel }: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: initial?.name ?? '',
      nickname: initial?.nickname ?? '',
      kelompok: initial?.kelompok ?? '',
      desa: initial?.desa ?? '',
      daerah: initial?.daerah ?? '',
      joinedAt: initial?.joinedAt?.slice(0, 10) ?? '',
      retiredAt: initial?.retiredAt?.slice(0, 10) ?? '',
      status: initial?.status ?? 'active',
      notes: initial?.notes ?? '',
    },
  })

  const apiError = error instanceof ApiError ? error.message : null

  return (
    <form
      onSubmit={handleSubmit((v) =>
        onSubmit({
          name: v.name,
          nickname: v.nickname || undefined,
          kelompok: v.kelompok,
          desa: v.desa,
          daerah: v.daerah,
          joinedAt: v.joinedAt || undefined,
          retiredAt: v.retiredAt || undefined,
          status: v.status,
          notes: v.notes || undefined,
        }),
      )}
      className="space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nama Guru" htmlFor="name" error={errors.name?.message}>
          <Input id="name" {...register('name')} />
        </Field>
        <Field label="Nama Panggilan" htmlFor="nickname" error={errors.nickname?.message}>
          <Input id="nickname" {...register('nickname')} />
        </Field>
        <Field label="Kelompok" htmlFor="kelompok" error={errors.kelompok?.message}>
          <Input id="kelompok" {...register('kelompok')} />
        </Field>
        <Field label="Desa" htmlFor="desa" error={errors.desa?.message}>
          <Input id="desa" {...register('desa')} />
        </Field>
        <Field
          label="Daerah"
          htmlFor="daerah"
          error={errors.daerah?.message}
          className="sm:col-span-2"
        >
          <Input id="daerah" {...register('daerah')} />
        </Field>
        <Field label="Tanggal Masuk" htmlFor="joinedAt" error={errors.joinedAt?.message}>
          <Input id="joinedAt" type="date" {...register('joinedAt')} />
        </Field>
        <Field label="Tanggal Purna" htmlFor="retiredAt" error={errors.retiredAt?.message}>
          <Input id="retiredAt" type="date" {...register('retiredAt')} />
        </Field>
        <Field label="Status" htmlFor="status" error={errors.status?.message}>
          <select
            id="status"
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            {...register('status')}
          >
            <option value="active">Aktif</option>
            <option value="retired">Purna</option>
          </select>
        </Field>
        <Field
          label="Keterangan"
          htmlFor="notes"
          error={errors.notes?.message}
          className="sm:col-span-2"
        >
          <textarea
            id="notes"
            rows={3}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            {...register('notes')}
          />
        </Field>
      </div>
      {apiError ? <p className="text-sm text-red-600">{apiError}</p> : null}
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? 'Menyimpan…' : submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Batal
          </Button>
        ) : null}
      </div>
    </form>
  )
}
