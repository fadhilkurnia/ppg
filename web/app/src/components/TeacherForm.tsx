import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery } from '@tanstack/react-query'
import { Users } from 'lucide-react'

import type { Teacher, TeacherInput } from '@/api/types'
import { ApiError } from '@/api/client'
import { getStudentsForTeacher } from '@/api/studentTeachers'
import { useTranslation, type TranslateFn } from '@/lib/i18n'
import { Button } from './Button'
import { Input } from './Input'
import { Field } from './Field'
import { AssignStudentsModal } from './AssignStudentsModal'

const buildSchema = (t: TranslateFn) => {
  const isoDateOrEmpty = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, t('validation.isoDate'))
    .optional()
    .or(z.literal(''))

  return z.object({
    name: z.string().min(1, t('validation.required')).max(200),
    nickname: z.string().max(200).optional().or(z.literal('')),
    kelompok: z.string().min(1, t('validation.required')).max(200),
    desa: z.string().min(1, t('validation.required')).max(200),
    daerah: z.string().min(1, t('validation.required')).max(200),
    joinedAt: isoDateOrEmpty,
    retiredAt: isoDateOrEmpty,
    status: z.enum(['active', 'retired']),
    notes: z.string().max(2000).optional().or(z.literal('')),
  })
}

type FormValues = z.infer<ReturnType<typeof buildSchema>>

type Props = {
  initial?: Teacher
  submitLabel: string
  pending?: boolean
  error?: unknown
  onSubmit: (input: TeacherInput) => void
  onCancel?: () => void
}

export function TeacherForm({ initial, submitLabel, pending, error, onSubmit, onCancel }: Props) {
  const { t } = useTranslation()
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(buildSchema(t)),
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
  const [assignStudentsOpen, setAssignStudentsOpen] = useState(false)

  const { data: assignedStudents } = useQuery({
    queryKey: ['teacher-students', initial?.id],
    queryFn: () => getStudentsForTeacher(initial!.id),
    enabled: !!initial?.id,
  })

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
        <Field label={t('teachers.fName')} htmlFor="name" error={errors.name?.message}>
          <Input id="name" {...register('name')} />
        </Field>
        <Field label={t('teachers.fNickname')} htmlFor="nickname" error={errors.nickname?.message}>
          <Input id="nickname" {...register('nickname')} />
        </Field>
        <Field label={t('teachers.fKelompok')} htmlFor="kelompok" error={errors.kelompok?.message}>
          <Input id="kelompok" {...register('kelompok')} />
        </Field>
        <Field label={t('teachers.fDesa')} htmlFor="desa" error={errors.desa?.message}>
          <Input id="desa" {...register('desa')} />
        </Field>
        <Field
          label={t('teachers.fDaerah')}
          htmlFor="daerah"
          error={errors.daerah?.message}
          className="sm:col-span-2"
        >
          <Input id="daerah" {...register('daerah')} />
        </Field>
        <Field label={t('teachers.fJoinedAt')} htmlFor="joinedAt" error={errors.joinedAt?.message}>
          <Input id="joinedAt" type="date" {...register('joinedAt')} />
        </Field>
        <Field
          label={t('teachers.fRetiredAt')}
          htmlFor="retiredAt"
          error={errors.retiredAt?.message}
        >
          <Input id="retiredAt" type="date" {...register('retiredAt')} />
        </Field>
        <Field label={t('teachers.fStatus')} htmlFor="status" error={errors.status?.message}>
          <Controller
            control={control}
            name="status"
            render={({ field }) => (
              <select
                id="status"
                className="h-10 rounded-md border border-slate-300 bg-white px-3 text-base sm:text-sm text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                {...field}
              >
                <option value="active">{t('status.active')}</option>
                <option value="retired">{t('status.retired')}</option>
              </select>
            )}
          />
        </Field>
        <Field
          label={t('teachers.fNotes')}
          htmlFor="notes"
          error={errors.notes?.message}
          className="sm:col-span-2"
        >
          <textarea
            id="notes"
            rows={3}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base sm:text-sm text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            {...register('notes')}
          />
        </Field>
      </div>

      {initial ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 p-3.5 sm:p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                {t('teachers.assignedStudents') || 'Generus / Murid Bimbingan'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {assignedStudents && assignedStudents.length > 0
                  ? `${assignedStudents.length} murid bimbingan dipilih`
                  : 'Belum ada murid bimbingan yang ditugaskan'}
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setAssignStudentsOpen(true)}
              className="inline-flex items-center gap-1.5 self-start sm:self-auto border-teal-300 dark:border-teal-800 text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950/40"
            >
              <Users size={14} />
              <span>{t('teachers.manageStudents') || 'Murid / Generus'}</span>
            </Button>
          </div>

          {assignedStudents && assignedStudents.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {assignedStudents.map((s) => (
                <span
                  key={s.id}
                  className="inline-flex items-center gap-1 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-1 text-xs text-slate-800 dark:text-slate-200"
                >
                  <span className="font-medium">{s.name}</span>
                  {s.nickname && <span className="opacity-70">({s.nickname})</span>}
                  <span className="text-[10px] text-teal-600 dark:text-teal-400">• {s.level}</span>
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {apiError ? <p className="text-sm text-red-600">{apiError}</p> : null}
      <div className="flex items-center justify-end gap-2 pt-2">
        {onCancel ? (
          <Button type="button" variant="secondary" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? t('common.saving') : submitLabel}
        </Button>
      </div>

      {initial && assignStudentsOpen ? (
        <AssignStudentsModal
          teacher={initial}
          open={assignStudentsOpen}
          onClose={() => setAssignStudentsOpen(false)}
        />
      ) : null}
    </form>
  )
}
