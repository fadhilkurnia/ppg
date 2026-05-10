import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import type { Student, StudentInput } from '@/api/types'
import { ApiError } from '@/api/client'
import { Button } from './Button'
import { Input } from './Input'
import { Field } from './Field'

const schema = z.object({
  studentId: z.string().min(1, 'Required').max(64),
  name: z.string().min(1, 'Required').max(200),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  gender: z.enum(['male', 'female']),
  address: z.string().max(500).optional().or(z.literal('')),
  parentName: z.string().min(1, 'Required').max(200),
  parentPhone: z.string().min(1, 'Required').max(64),
  parentEmail: z
    .string()
    .email('Invalid email')
    .optional()
    .or(z.literal('')),
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
      studentId: initial?.studentId ?? '',
      name: initial?.name ?? '',
      dateOfBirth: initial?.dateOfBirth?.slice(0, 10) ?? '',
      gender: initial?.gender ?? 'male',
      address: initial?.address ?? '',
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
          ...v,
          address: v.address || undefined,
          parentEmail: v.parentEmail || undefined,
        }),
      )}
      className="space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Student ID" htmlFor="studentId" error={errors.studentId?.message}>
          <Input id="studentId" {...register('studentId')} />
        </Field>
        <Field label="Name" htmlFor="name" error={errors.name?.message}>
          <Input id="name" {...register('name')} />
        </Field>
        <Field label="Date of birth" htmlFor="dateOfBirth" error={errors.dateOfBirth?.message}>
          <Input id="dateOfBirth" type="date" {...register('dateOfBirth')} />
        </Field>
        <Field label="Gender" htmlFor="gender" error={errors.gender?.message}>
          <select
            id="gender"
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            {...register('gender')}
          >
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </Field>
        <Field
          label="Address"
          htmlFor="address"
          error={errors.address?.message}
          className="sm:col-span-2"
        >
          <Input id="address" {...register('address')} />
        </Field>
        <Field label="Parent name" htmlFor="parentName" error={errors.parentName?.message}>
          <Input id="parentName" {...register('parentName')} />
        </Field>
        <Field label="Parent phone" htmlFor="parentPhone" error={errors.parentPhone?.message}>
          <Input id="parentPhone" {...register('parentPhone')} />
        </Field>
        <Field
          label="Parent email"
          htmlFor="parentEmail"
          error={errors.parentEmail?.message}
          className="sm:col-span-2"
        >
          <Input id="parentEmail" type="email" {...register('parentEmail')} />
        </Field>
      </div>
      {apiError ? <p className="text-sm text-red-600">{apiError}</p> : null}
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  )
}
