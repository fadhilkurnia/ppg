import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'

import { listPublicTeachers, listPublicStudents } from '@/api/public'
import type { PublicAttendanceInput } from '@/api/public'
import { ApiError } from '@/api/client'
import { Button } from './Button'
import { Input } from './Input'
import { Field } from './Field'

const phoneRe = /^(\+?62|0)\d{7,14}$/

const statusOptions = [
  { value: 'hadir', label: 'HADIR' },
  { value: 'by_vn', label: 'By VN' },
  { value: 'izin_guru', label: 'IZIN (GURU)' },
  { value: 'izin_murid', label: 'IZIN (MURID)' },
] as const

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Gunakan format YYYY-MM-DD'),
  durationMin: z
    .union([z.string().length(0), z.coerce.number().int().min(0).max(1440)])
    .optional(),
  teacherId: z.string().min(1, 'Wajib dipilih'),
  studentId: z.string().min(1, 'Wajib dipilih'),
  status: z.enum(['hadir', 'by_vn', 'izin_guru', 'izin_murid']),
  materi: z.string().max(20000).optional().or(z.literal('')),
  submittedPhone: z
    .string()
    .min(1, 'Wajib diisi')
    .regex(phoneRe, 'Gunakan format 08… atau +62…'),
})

type FormValues = z.infer<typeof schema>

type Props = {
  submitLabel: string
  pending?: boolean
  error?: unknown
  onSubmit: (input: PublicAttendanceInput) => void
}

export function PublicAttendanceForm({ submitLabel, pending, error, onSubmit }: Props) {
  const teachersQ = useQuery({
    queryKey: ['public', 'teachers'],
    queryFn: listPublicTeachers,
    staleTime: 5 * 60_000,
  })
  const studentsQ = useQuery({
    queryKey: ['public', 'students'],
    queryFn: listPublicStudents,
    staleTime: 5 * 60_000,
  })

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      date: new Date().toISOString().slice(0, 10),
      durationMin: undefined,
      teacherId: '',
      studentId: '',
      status: 'hadir',
      materi: '',
      submittedPhone: '',
    },
  })

  const apiError = error instanceof ApiError ? error.message : null
  const loading = teachersQ.isPending || studentsQ.isPending

  return (
    <form
      onSubmit={handleSubmit((v) =>
        onSubmit({
          date: v.date,
          durationMin:
            typeof v.durationMin === 'number' && Number.isFinite(v.durationMin)
              ? v.durationMin
              : undefined,
          teacherId: v.teacherId,
          studentId: v.studentId,
          status: v.status,
          materi: v.materi || undefined,
          submittedPhone: v.submittedPhone,
        }),
      )}
      className="space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tanggal" htmlFor="date" error={errors.date?.message}>
          <Input id="date" type="date" {...register('date')} />
        </Field>
        <Field label="Durasi (menit)" htmlFor="durationMin" error={errors.durationMin?.message}>
          <Input
            id="durationMin"
            type="number"
            min={0}
            max={1440}
            placeholder="cth. 45"
            {...register('durationMin')}
          />
        </Field>
        <Field label="Nama Guru" htmlFor="teacherId" error={errors.teacherId?.message}>
          <Controller
            control={control}
            name="teacherId"
            render={({ field }) => (
              <Select id="teacherId" {...field}>
                <option value="">— Pilih guru —</option>
                {teachersQ.data?.items.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.nickname ? ` (${t.nickname})` : ''}
                  </option>
                ))}
              </Select>
            )}
          />
        </Field>
        <Field label="Nama Murid" htmlFor="studentId" error={errors.studentId?.message}>
          <Controller
            control={control}
            name="studentId"
            render={({ field }) => (
              <Select id="studentId" {...field}>
                <option value="">— Pilih murid —</option>
                {studentsQ.data?.items.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.nickname ? ` (${s.nickname})` : ''}
                  </option>
                ))}
              </Select>
            )}
          />
        </Field>
      </div>

      <Field label="Kehadiran" htmlFor="status-group" error={errors.status?.message}>
        <Controller
          control={control}
          name="status"
          render={({ field }) => (
            <div
              id="status-group"
              role="radiogroup"
              className="grid gap-2 sm:grid-cols-2"
            >
              {statusOptions.map((opt) => (
                <label
                  key={opt.value}
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50 has-[:checked]:border-slate-900 has-[:checked]:bg-slate-900 has-[:checked]:text-white"
                >
                  <input
                    type="radio"
                    name={field.name}
                    value={opt.value}
                    checked={field.value === opt.value}
                    onChange={() => field.onChange(opt.value)}
                    className="h-4 w-4"
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          )}
        />
      </Field>

      <Field label="Materi" htmlFor="materi" error={errors.materi?.message}>
        <textarea
          id="materi"
          rows={6}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          {...register('materi')}
        />
      </Field>

      <Field
        label="No. WhatsApp"
        htmlFor="submittedPhone"
        error={errors.submittedPhone?.message}
        hint="Contoh: 081234567890 atau +6281234567890"
      >
        <Input
          id="submittedPhone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="081234567890"
          {...register('submittedPhone')}
        />
      </Field>

      {loading ? (
        <p className="text-sm text-slate-500">Memuat daftar guru dan murid…</p>
      ) : null}
      {apiError ? <p className="text-sm text-red-600">{apiError}</p> : null}

      <Button type="submit" className="w-full" disabled={pending || loading}>
        {pending ? 'Mengirim…' : submitLabel}
      </Button>
    </form>
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
