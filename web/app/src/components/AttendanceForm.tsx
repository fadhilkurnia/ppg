import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'

import { ATTENDANCE_STATUSES, type Attendance, type AttendanceInput } from '@/api/types'
import { listStudents } from '@/api/students'
import { listTeachers } from '@/api/teachers'
import { ApiError } from '@/api/client'
import { useAttendanceStatusLabel, useTranslation, type TranslateFn } from '@/lib/i18n'
import { cn } from '@/lib/cn'
import { Button } from './Button'
import { Input } from './Input'
import { Field } from './Field'

const buildSchema = (t: TranslateFn) =>
  z.object({
    date: z.string().min(1, t('validation.requiredDate')).regex(/^\d{4}-\d{2}-\d{2}$/, t('validation.isoDate')),
    durationMin: z.coerce
      .number({ invalid_type_error: t('validation.requiredDuration') })
      .int()
      .min(1, t('validation.requiredDuration'))
      .max(1440),
    teacherId: z.string().min(1, t('validation.requiredSelect')),
    studentId: z.string().min(1, t('validation.requiredSelect')),
    status: z.enum(ATTENDANCE_STATUSES),
    materi: z.string().max(20000).optional().or(z.literal('')),
  })

type FormValues = z.infer<ReturnType<typeof buildSchema>>

type Props = {
  initial?: Attendance
  submitLabel: string
  pending?: boolean
  error?: unknown
  onSubmit: (input: AttendanceInput) => void
  onCancel?: () => void
}

export function AttendanceForm({ initial, submitLabel, pending, error, onSubmit, onCancel }: Props) {
  const { t } = useTranslation()
  const statusLabel = useAttendanceStatusLabel()
  const teachersQ = useQuery({
    queryKey: ['teachers', 'all-for-select'],
    queryFn: () => listTeachers({ status: 'active', limit: 200 }),
    staleTime: 5 * 60_000,
  })
  const studentsQ = useQuery({
    queryKey: ['students', 'all-for-select'],
    queryFn: () => listStudents({ status: 'active', limit: 200 }),
    staleTime: 5 * 60_000,
  })

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(buildSchema(t)),
    defaultValues: {
      date: initial?.date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
      durationMin: initial?.durationMin ?? undefined,
      teacherId: initial?.teacherId ?? '',
      studentId: initial?.studentId ?? '',
      status: initial?.status ?? 'hadir',
      materi: initial?.materi ?? '',
    },
  })

  const currentStatus = watch('status')
  const isExcused = currentStatus === 'izin_murid' || currentStatus === 'izin_guru'

  useEffect(() => {
    if (isExcused) {
      setValue('durationMin', 1)
    }
  }, [isExcused, setValue])

  const apiError = error instanceof ApiError ? error.message : null
  const loading = teachersQ.isPending || studentsQ.isPending

  return (
    <form
      onSubmit={handleSubmit((v) =>
        onSubmit({
          date: v.date,
          durationMin: isExcused
            ? 1
            : typeof v.durationMin === 'number' && Number.isFinite(v.durationMin)
              ? v.durationMin
              : undefined,
          teacherId: v.teacherId,
          studentId: v.studentId,
          status: v.status,
          materi: v.materi || undefined,
        }),
      )}
      className="space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('sessions.fDate')} htmlFor="date" error={errors.date?.message}>
          <Input id="date" type="date" required {...register('date')} />
        </Field>
        <Field
          label={t('sessions.fDuration')}
          htmlFor="durationMin"
          error={errors.durationMin?.message}
        >
          <Input
            id="durationMin"
            type="number"
            min={1}
            max={1440}
            required
            disabled={isExcused}
            placeholder={t('sessions.fDurationPh')}
            className={cn(isExcused && 'bg-slate-100 dark:bg-slate-800 text-slate-500 cursor-not-allowed opacity-75 font-semibold')}
            {...register('durationMin')}
          />
        </Field>
        <Field label={t('sessions.fTeacher')} htmlFor="teacherId" error={errors.teacherId?.message}>
          <Controller
            control={control}
            name="teacherId"
            render={({ field }) => (
              <Select id="teacherId" {...field}>
                <option value="">{t('sessions.pickTeacher')}</option>
                {teachersQ.data?.items.map((tc) => (
                  <option key={tc.id} value={tc.id}>
                    {tc.name}
                    {tc.nickname ? ` (${tc.nickname})` : ''}
                  </option>
                ))}
              </Select>
            )}
          />
        </Field>
        <Field label={t('sessions.fStudent')} htmlFor="studentId" error={errors.studentId?.message}>
          <Controller
            control={control}
            name="studentId"
            render={({ field }) => (
              <Select id="studentId" {...field}>
                <option value="">{t('sessions.pickStudent')}</option>
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
        <Field label={t('sessions.fStatus')} htmlFor="status" error={errors.status?.message}>
          <Controller
            control={control}
            name="status"
            render={({ field }) => (
              <Select id="status" {...field}>
                {ATTENDANCE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {statusLabel(s)}
                  </option>
                ))}
              </Select>
            )}
          />
        </Field>
        <Field
          label={t('sessions.fMateri')}
          htmlFor="materi"
          error={errors.materi?.message}
          className="sm:col-span-2"
        >
          <textarea
            id="materi"
            rows={8}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base sm:text-sm text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            {...register('materi')}
          />
        </Field>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">{t('sessions.loadingLists')}</p>
      ) : null}
      {apiError ? <p className="text-sm text-red-600">{apiError}</p> : null}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending || loading}>
          {pending ? t('common.saving') : submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" variant="secondary" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
        ) : null}
      </div>
    </form>
  )
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-base sm:text-sm text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
    />
  )
}
