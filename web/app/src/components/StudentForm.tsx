import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import {
  STUDENT_KELOMPOKS,
  STUDENT_LEVELS,
  type Student,
  type StudentInput,
} from '@/api/types'
import { ApiError } from '@/api/client'
import { useTranslation } from '@/i18n'
import { Button } from './Button'
import { Input } from './Input'
import { Field } from './Field'

type Props = {
  initial?: Student
  submitLabel: string
  pending?: boolean
  error?: unknown
  onSubmit: (input: StudentInput) => void
  onCancel?: () => void
}

export function StudentForm({ initial, submitLabel, pending, error, onSubmit, onCancel }: Props) {
  const { t } = useTranslation()

  const isoDateOrEmpty = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, t('validation.isoDate'))
    .optional()
    .or(z.literal(''))

  const schema = z.object({
    name: z.string().min(1, t('validation.required')).max(200),
    nickname: z.string().max(200).optional().or(z.literal('')),
    dateOfBirth: isoDateOrEmpty,
    gender: z.enum(['male', 'female']),
    level: z
      .enum([...STUDENT_LEVELS, ''] as [string, ...string[]])
      .refine((v) => v !== '', { message: t('validation.required') }),
    kelompok: z
      .enum([...STUDENT_KELOMPOKS, ''] as [string, ...string[]])
      .refine((v) => v !== '', { message: t('validation.required') }),
    city: z.string().max(200).optional().or(z.literal('')),
    joinedAt: isoDateOrEmpty,
    leftAt: isoDateOrEmpty,
    leaveReason: z.string().max(500).optional().or(z.literal('')),
    status: z.enum(['active', 'left']),
    parentName: z.string().max(200).optional().or(z.literal('')),
    parentPhone: z.string().max(64).optional().or(z.literal('')),
    parentEmail: z.string().email(t('validation.invalidEmail')).optional().or(z.literal('')),
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
      name: initial?.name ?? '',
      nickname: initial?.nickname ?? '',
      dateOfBirth: initial?.dateOfBirth?.slice(0, 10) ?? '',
      gender: initial?.gender ?? 'female',
      level: (initial?.level as FormValues['level']) ?? '',
      kelompok: (initial?.kelompok as FormValues['kelompok']) ?? '',
      city: initial?.city ?? '',
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
          gender: v.gender,
          level: v.level as StudentInput['level'],
          kelompok: v.kelompok as StudentInput['kelompok'],
          city: v.city || undefined,
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
      <Section title={t('students.sectionStudent')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('students.fName')} htmlFor="name" error={errors.name?.message}>
            <Input id="name" {...register('name')} />
          </Field>
          <Field label={t('students.fNickname')} htmlFor="nickname" error={errors.nickname?.message}>
            <Input id="nickname" {...register('nickname')} />
          </Field>
          <Field label={t('students.fDob')} htmlFor="dateOfBirth" error={errors.dateOfBirth?.message}>
            <Input id="dateOfBirth" type="date" {...register('dateOfBirth')} />
          </Field>
          <Field label={t('students.fGender')} htmlFor="gender" error={errors.gender?.message}>
            <Controller
              control={control}
              name="gender"
              render={({ field }) => (
                <Select id="gender" {...field}>
                  <option value="female">{t('dashboard.female')}</option>
                  <option value="male">{t('dashboard.male')}</option>
                </Select>
              )}
            />
          </Field>
          <Field label={t('students.fLevel')} htmlFor="level" error={errors.level?.message}>
            <Controller
              control={control}
              name="level"
              render={({ field }) => (
                <Select id="level" {...field}>
                  <option value="">—</option>
                  {STUDENT_LEVELS.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </Select>
              )}
            />
          </Field>
          <Field
            label={t('students.fKelompok')}
            htmlFor="kelompok"
            error={errors.kelompok?.message}
          >
            <Controller
              control={control}
              name="kelompok"
              render={({ field }) => (
                <Select id="kelompok" {...field}>
                  <option value="">—</option>
                  {STUDENT_KELOMPOKS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </Select>
              )}
            />
          </Field>
          <Field label={t('students.fCity')} htmlFor="city" error={errors.city?.message}>
            <Input id="city" placeholder={t('students.fCityPh')} {...register('city')} />
          </Field>
        </div>
      </Section>

      <Section title={t('students.sectionMembership')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('students.fJoinedAt')} htmlFor="joinedAt" error={errors.joinedAt?.message}>
            <Input id="joinedAt" type="date" {...register('joinedAt')} />
          </Field>
          <Field label={t('students.fStatus')} htmlFor="status" error={errors.status?.message}>
            <Controller
              control={control}
              name="status"
              render={({ field }) => (
                <Select id="status" {...field}>
                  <option value="active">{t('status.active')}</option>
                  <option value="left">{t('status.left')}</option>
                </Select>
              )}
            />
          </Field>
          <Field label={t('students.fLeftAt')} htmlFor="leftAt" error={errors.leftAt?.message}>
            <Input id="leftAt" type="date" {...register('leftAt')} />
          </Field>
          <Field
            label={t('students.fLeaveReason')}
            htmlFor="leaveReason"
            error={errors.leaveReason?.message}
            className="sm:col-span-2"
          >
            <Input id="leaveReason" {...register('leaveReason')} />
          </Field>
        </div>
      </Section>

      <Section title={t('students.sectionParent')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('students.fParentName')} htmlFor="parentName" error={errors.parentName?.message}>
            <Input id="parentName" {...register('parentName')} />
          </Field>
          <Field label={t('students.fParentPhone')} htmlFor="parentPhone" error={errors.parentPhone?.message}>
            <Input id="parentPhone" {...register('parentPhone')} />
          </Field>
          <Field
            label={t('students.fParentEmail')}
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
