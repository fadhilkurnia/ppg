import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { createUser, USER_ROLES, type UserRole } from '@/api/users'
import { ApiError } from '@/api/client'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import { Field } from '@/components/Field'
import { PageShell } from '@/components/PageShell'
import { useRoleLabel } from './Users'

type FormValues = {
  email: string
  username?: string
  name: string
  password: string
  role: UserRole
}

export function UserNewPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { t } = useTranslation()
  const roleLabel = useRoleLabel()

  const schema = useMemo(
    () =>
      z.object({
        email: z.string().email(t('users.userNew.errEmail')),
        username: z.string().optional().or(z.literal('')),
        name: z.string().min(1, t('users.userNew.errNameRequired')).max(200),
        password: z.string().min(6, t('users.userNew.errPasswordMin')).max(200),
        role: z.enum(USER_ROLES),
      }),
    [t],
  )

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { role: 'staff' as UserRole },
  })

  const mutation = useMutation({
    mutationFn: createUser,
    onSuccess: async (created) => {
      await qc.invalidateQueries({ queryKey: ['users'] })
      navigate(`/pengaturan/pengguna/${created.id}`)
    },
  })

  const apiError = mutation.error instanceof ApiError ? mutation.error.message : null

  const onSubmit = (v: FormValues) => {
    mutation.mutate({
      email: v.email.trim(),
      username: v.username?.trim() || undefined,
      name: v.name.trim(),
      password: v.password,
      role: v.role,
    })
  }

  return (
    <PageShell header={<h1 className="text-lg font-semibold">{t('users.userNew.title')}</h1>}>
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('users.userNew.fullName')} htmlFor="name" error={errors.name?.message}>
              <Input id="name" type="text" autoComplete="name" autoFocus {...register('name')} />
            </Field>
            <Field label={t('users.userNew.email')} htmlFor="email" error={errors.email?.message}>
              <Input id="email" type="email" autoComplete="email" {...register('email')} />
            </Field>
            <Field
              label={t('users.userNew.usernameOptional')}
              htmlFor="username"
              error={errors.username?.message}
            >
              <Input
                id="username"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                placeholder={t('users.userNew.usernamePh')}
                {...register('username')}
              />
            </Field>
            <Field label={t('users.userNew.role')} htmlFor="role" error={errors.role?.message}>
              <select
                id="role"
                className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                {...register('role')}
              >
                {USER_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {roleLabel(r)}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label={t('users.userNew.password')}
              htmlFor="password"
              error={errors.password?.message}
              className="sm:col-span-2"
            >
              <Input
                id="password"
                type="text"
                autoComplete="new-password"
                placeholder={t('users.userNew.passwordPh')}
                {...register('password')}
              />
            </Field>
          </div>
          {apiError ? <p className="text-sm text-red-600">{apiError}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => navigate('/pengaturan/pengguna')}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </form>
      </div>
    </PageShell>
  )
}
