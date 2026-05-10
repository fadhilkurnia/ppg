import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { STUDENT_LEVELS, type Student, type StudentInput } from '@/api/types'
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
  dateOfBirth: isoDateOrEmpty,
  level: z.enum([...STUDENT_LEVELS, ''] as [string, ...string[]]),
  kelompok: z.string().max(200).optional().or(z.literal('')),
  joinedAt: isoDateOrEmpty,
  leftAt: isoDateOrEmpty,
  leaveReason: z.string().max(500).optional().or(z.literal('')),
  status: z.enum(['active', 'left']),
  parentName: z.string().max(200).optional().or(z.literal('')),
  parentPhone: z.string().max(64).optional().or(z.literal('')),
  parentEmail: z.string().email('Format email tidak valid').optional().or(z.literal('')),
})

type FormValues = z.infer<typeof schema>

type Props = {
  initial?: Student
  submitLabel: string
  pending?: boolean
  error?: unknown
  onSubmit: (input: StudentInput) => void
  onCancel?: () => void
}

export function StudentForm({ initial, submitLabel, pending, error, onSubmit, onCancel }: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: initial?.name ?? '',
      nickname: initial?.nickname ?? '',
      dateOfBirth: initial?.dateOfBirth?.slice(0, 10) ?? '',
      level: (initial?.level as FormValues['level']) ?? '',
      kelompok: initial?.kelompok ?? '',
      joinedAt: initial?.joinedAt?.slice(0, 10) ?? '',
      leftAt: initial?.leftAt?.slice(0, 10) ?? '',
      leaveReason: initial?.leaveReason ?? '',
      status: initial?.status ?? 'active',
      parentName: initial?.parentName ?? '',
      parentPhone: initial?.parentPhone ?? '',
      parentEmail: initial?.parentEmail ?? '',
    },
  })

  const apiError = error instanceof ApiError ? error.message : null

  return (
    <form
      onSubmit={handleSubmit((v) =>
        onSubmit({
          name: v.name,
          nickname: v.nickname || undefined,
          dateOfBirth: v.dateOfBirth || undefined,
          level: v.level === '' ? undefined : (v.level as StudentInput['level']),
          kelompok: v.kelompok || undefined,
          joinedAt: v.joinedAt || undefined,
          leftAt: v.leftAt || undefined,
          leaveReason: v.leaveReason || undefined,
          status: v.status,
          parentName: v.parentName || undefined,
          parentPhone: v.parentPhone || undefined,
          parentEmail: v.parentEmail || undefined,
        }),
      )}
      className="space-y-6"
    >
      <Section title="Data Generus">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nama" htmlFor="name" error={errors.name?.message}>
            <Input id="name" {...register('name')} />
          </Field>
          <Field label="Nama Panggilan" htmlFor="nickname" error={errors.nickname?.message}>
            <Input id="nickname" {...register('nickname')} />
          </Field>
          <Field label="Tanggal Lahir" htmlFor="dateOfBirth" error={errors.dateOfBirth?.message}>
            <Input id="dateOfBirth" type="date" {...register('dateOfBirth')} />
          </Field>
          <Field label="Jenjang" htmlFor="level" error={errors.level?.message}>
            <Select id="level" {...register('level')}>
              <option value="">—</option>
              {STUDENT_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Kelompok" htmlFor="kelompok" error={errors.kelompok?.message} className="sm:col-span-2">
            <Input id="kelompok" {...register('kelompok')} />
          </Field>
        </div>
      </Section>

      <Section title="Keanggotaan">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tanggal Masuk" htmlFor="joinedAt" error={errors.joinedAt?.message}>
            <Input id="joinedAt" type="date" {...register('joinedAt')} />
          </Field>
          <Field label="Status" htmlFor="status" error={errors.status?.message}>
            <Select id="status" {...register('status')}>
              <option value="active">Aktif</option>
              <option value="left">Keluar</option>
            </Select>
          </Field>
          <Field label="Tanggal Keluar" htmlFor="leftAt" error={errors.leftAt?.message}>
            <Input id="leftAt" type="date" {...register('leftAt')} />
          </Field>
          <Field
            label="Keterangan Keluar"
            htmlFor="leaveReason"
            error={errors.leaveReason?.message}
            className="sm:col-span-2"
          >
            <Input id="leaveReason" {...register('leaveReason')} />
          </Field>
        </div>
      </Section>

      <Section title="Orang Tua (opsional)">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nama Orang Tua" htmlFor="parentName" error={errors.parentName?.message}>
            <Input id="parentName" {...register('parentName')} />
          </Field>
          <Field label="Telepon Orang Tua" htmlFor="parentPhone" error={errors.parentPhone?.message}>
            <Input id="parentPhone" {...register('parentPhone')} />
          </Field>
          <Field
            label="Email Orang Tua"
            htmlFor="parentEmail"
            error={errors.parentEmail?.message}
            className="sm:col-span-2"
          >
            <Input id="parentEmail" type="email" {...register('parentEmail')} />
          </Field>
        </div>
      </Section>

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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold text-slate-700">{title}</legend>
      {children}
    </fieldset>
  )
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
    />
  )
}
