import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'

import { listPublicTeachers, listPublicStudents } from '@/api/public'
import type { PublicAttendanceInput } from '@/api/public'
import { ApiError } from '@/api/client'
import { useTranslation } from '@/i18n'
import { Button } from './Button'
import { Input } from './Input'
import { Field } from './Field'

const phoneRe = /^(\+?62|0)\d{7,14}$/

type Props = {
  submitLabel: string
  pending?: boolean
  error?: unknown
  onSubmit: (input: PublicAttendanceInput) => void
}

export function PublicAttendanceForm({ submitLabel, pending, error, onSubmit }: Props) {
  const { t } = useTranslation()

  const statusOptions = [
    { value: 'hadir', label: t('publicStatus.hadir') },
    { value: 'by_vn', label: t('publicStatus.by_vn') },
    { value: 'izin_guru', label: t('publicStatus.izin_guru') },
    { value: 'izin_murid', label: t('publicStatus.izin_murid') },
  ] as const

  const schema = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, t('validation.isoDate')),
    durationMin: z
      .union([z.string().length(0), z.coerce.number().int().min(0).max(1440)])
      .optional(),
    teacherId: z.string().min(1, t('validation.requiredSelect')),
    studentId: z.string().min(1, t('validation.requiredSelect')),
    status: z.enum(['hadir', 'by_vn', 'izin_guru', 'izin_murid']),
    materi: z.string().max(20000).optional().or(z.literal('')),
    submittedPhone: z
      .string()
      .min(1, t('validation.required'))
      .regex(phoneRe, t('validation.invalidPhone')),
  })

  type FormValues = z.infer<typeof schema>

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
      className="space-y-5 sm:space-y-4"
    >
      <div className="grid gap-5 sm:grid-cols-2 sm:gap-4">
        <Field label={t('absen.fDate')} htmlFor="date" error={errors.date?.message}>
          <Input id="date" type="date" className={inputMobile} {...register('date')} />
        </Field>
        <Field label={t('absen.fDuration')} htmlFor="durationMin" error={errors.durationMin?.message}>
          <Input
            id="durationMin"
            type="number"
            inputMode="numeric"
            min={0}
            max={1440}
            placeholder={t('absen.fDurationPh')}
            className={inputMobile}
            {...register('durationMin')}
          />
        </Field>
        <Field label={t('absen.fTeacher')} htmlFor="teacherId" error={errors.teacherId?.message}>
          <Controller
            control={control}
            name="teacherId"
            render={({ field }) => (
              <Select id="teacherId" {...field}>
                <option value="">{t('absen.pickTeacher')}</option>
                {teachersQ.data?.items.map((te) => (
                  <option key={te.id} value={te.id}>
                    {te.name}
                    {te.nickname ? ` (${te.nickname})` : ''}
                  </option>
                ))}
              </Select>
            )}
          />
        </Field>
        <Field label={t('absen.fStudent')} htmlFor="studentId" error={errors.studentId?.message}>
          <Controller
            control={control}
            name="studentId"
            render={({ field }) => (
              <Select id="studentId" {...field}>
                <option value="">{t('absen.pickStudent')}</option>
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

      <Field label={t('absen.fAttendance')} htmlFor="status-group" error={errors.status?.message}>
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
                  className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-slate-300 bg-white px-3 py-3 text-base hover:bg-slate-50 has-[:checked]:border-slate-900 has-[:checked]:bg-slate-900 has-[:checked]:text-white sm:min-h-0 sm:py-2 sm:text-sm"
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

      <Field label={t('absen.fMateri')} htmlFor="materi" error={errors.materi?.message}>
        <textarea
          id="materi"
          rows={6}
          className="block w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 sm:text-sm"
          {...register('materi')}
        />
      </Field>

      <Field
        label={t('absen.fPhone')}
        htmlFor="submittedPhone"
        error={errors.submittedPhone?.message}
        hint={t('absen.phoneHint')}
      >
        <Input
          id="submittedPhone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="081234567890"
          className={inputMobile}
          {...register('submittedPhone')}
        />
      </Field>

      {loading ? (
        <p className="text-sm text-slate-500">{t('absen.loadingLists')}</p>
      ) : null}
      {apiError ? <p className="text-sm text-red-600">{apiError}</p> : null}

      <Button
        type="submit"
        className="h-12 w-full text-base sm:h-10 sm:text-sm"
        disabled={pending || loading}
      >
        {pending ? t('absen.sending') : submitLabel}
      </Button>
    </form>
  )
}

// 16px font-size on mobile prevents iOS Safari from zooming when the field
// gets focused; 44px tap targets match WCAG/Apple touch guidance. The
// admin dashboard keeps its denser sm: defaults from the breakpoint up.
const inputMobile = 'h-11 text-base sm:h-10 sm:text-sm'

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 sm:h-10 sm:text-sm"
    />
  )
}
