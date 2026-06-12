import { useMemo } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'

import { listPublicTeachers, listPublicStudents } from '@/api/public'
import type { PublicAttendanceInput } from '@/api/public'
import { ApiError } from '@/api/client'
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

type PublicFormValues = {
  date: string
  durationMin: string | number | undefined
  teacherId: string
  studentId: string
  status: 'hadir' | 'by_vn' | 'izin_guru' | 'izin_murid'
  materi: string
  submittedPhone: string
}

export function PublicAttendanceForm({ submitLabel, pending, error, onSubmit }: Props) {
  const { t } = useTranslation()

  const statusOptions = useMemo(
    () => [
      { value: 'hadir', label: t('absen.form.statusHadir') },
      { value: 'by_vn', label: t('absen.form.statusByVn') },
      { value: 'izin_guru', label: t('absen.form.statusIzinGuru') },
      { value: 'izin_murid', label: t('absen.form.statusIzinMurid') },
    ],
    [t],
  )

  const schema = useMemo(
    () =>
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, t('absen.form.dateInvalid')),
        durationMin: z
          .union([z.string().length(0), z.coerce.number().int().min(0).max(1440)])
          .optional(),
        teacherId: z.string().min(1, t('absen.form.requiredSelect')),
        studentId: z.string().min(1, t('absen.form.requiredSelect')),
        status: z.enum(['hadir', 'by_vn', 'izin_guru', 'izin_murid']),
        materi: z.string().max(20000).optional().or(z.literal('')),
        submittedPhone: z
          .string()
          .min(1, t('absen.form.required'))
          .regex(phoneRe, t('absen.form.phoneInvalid')),
      }),
    [t],
  )

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
  } = useForm<PublicFormValues>({
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
        <Field label={t('absen.form.date')} htmlFor="date" error={errors.date?.message}>
          <Input id="date" type="date" {...register('date')} />
        </Field>
        <Field label={t('absen.form.durationMin')} htmlFor="durationMin" error={errors.durationMin?.message}>
          <Input
            id="durationMin"
            type="number"
            min={0}
            max={1440}
            placeholder={t('absen.form.durationPlaceholder')}
            {...register('durationMin')}
          />
        </Field>
        <Field label={t('absen.form.teacher')} htmlFor="teacherId" error={errors.teacherId?.message}>
          <Controller
            control={control}
            name="teacherId"
            render={({ field }) => (
              <Select id="teacherId" {...field}>
                <option value="">{t('absen.form.selectTeacher')}</option>
                {teachersQ.data?.items.map((tr) => (
                  <option key={tr.id} value={tr.id}>
                    {tr.name}
                    {tr.nickname ? ` (${tr.nickname})` : ''}
                  </option>
                ))}
              </Select>
            )}
          />
        </Field>
        <Field label={t('absen.form.student')} htmlFor="studentId" error={errors.studentId?.message}>
          <Controller
            control={control}
            name="studentId"
            render={({ field }) => (
              <Select id="studentId" {...field}>
                <option value="">{t('absen.form.selectStudent')}</option>
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

      <Field label={t('absen.form.status')} htmlFor="status-group" error={errors.status?.message}>
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

      <Field label={t('absen.form.materi')} htmlFor="materi" error={errors.materi?.message}>
        <textarea
          id="materi"
          rows={6}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          {...register('materi')}
        />
      </Field>

      <Field
        label={t('absen.form.phone')}
        htmlFor="submittedPhone"
        error={errors.submittedPhone?.message}
        hint={t('absen.form.phoneHint')}
      >
        <Input
          id="submittedPhone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder={t('absen.form.phonePlaceholder')}
          {...register('submittedPhone')}
        />
      </Field>

      {loading ? (
        <p className="text-sm text-slate-500">{t('absen.form.loadingOptions')}</p>
      ) : null}
      {apiError ? <p className="text-sm text-red-600">{apiError}</p> : null}

      <Button type="submit" className="w-full" disabled={pending || loading}>
        {pending ? t('absen.form.sending') : submitLabel}
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