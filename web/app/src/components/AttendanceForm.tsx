import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'

import { ATTENDANCE_STATUSES, type Attendance, type AttendanceInput } from '@/api/types'
import { listStudents } from '@/api/students'
import { listTeachers } from '@/api/teachers'
import { ApiError } from '@/api/client'
import { useTranslation } from '@/i18n'
import { useAttendanceStatusLabel } from '@/i18n/labels'
import { Button } from './Button'
import { Input } from './Input'
import { Field } from './Field'

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

  const schema = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, t('validation.isoDate')),
    durationMin: z
      .union([z.string().length(0), z.coerce.number().int().min(0).max(1440)])
      .optional(),
    teacherId: z.string().min(1, t('validation.requiredSelect')),
    studentId: z.string().min(1, t('validation.requiredSelect')),
    status: z.enum(ATTENDANCE_STATUSES),
    materi: z.string().max(20000).optional().or(z.literal('')),
  })

  type FormValues = z.infer<typeof schema>

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      date: initial?.date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
      durationMin: initial?.durationMin ?? undefined,
      teacherId: initial?.teacherId ?? '',
      studentId: initial?.studentId ?? '',
      status: initial?.status ?? 'hadir',
      materi: initial?.materi ?? '',
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
        }),
      )}
      className="space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('sessions.fDate')} htmlFor="date" error={errors.date?.message}>
          <Input id="date" type="date" {...register('date')} />
        </Field>
        <Field label={t('sessions.fDuration')} htmlFor="durationMin" error={errors.durationMin?.message}>
          <Input
            id="durationMin"
            type="number"
            min={0}
            max={1440}
            placeholder={t('sessions.fDurationPh')}
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
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
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
      className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
    />
  )
}
