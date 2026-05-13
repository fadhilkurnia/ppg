import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation } from '@tanstack/react-query'

import { login } from '@/api/auth'
import { ApiError } from '@/api/client'
import { ME_QUERY_KEY, useSetMe } from '@/lib/auth'
import { me } from '@/api/auth'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import { Field } from '@/components/Field'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { useTranslation } from '@/i18n'

export const Route = createFileRoute('/login')({
  beforeLoad: async ({ context }) => {
    try {
      const user = await context.queryClient.fetchQuery({
        queryKey: ME_QUERY_KEY,
        queryFn: me,
      })
      if (user) throw redirect({ to: '/dashboard' })
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return
      throw err
    }
  },
  component: LoginPage,
})

function LoginPage() {
  const navigate = useNavigate()
  const setMe = useSetMe()
  const { t } = useTranslation()

  const schema = z.object({
    identifier: z.string().min(1, t('login.errIdentifierRequired')),
    password: z.string().min(1, t('login.errPasswordRequired')),
  })
  type FormValues = z.infer<typeof schema>

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  const mutation = useMutation({
    mutationFn: ({ identifier, password }: FormValues) => login(identifier, password),
    onSuccess: async (user) => {
      setMe(user)
      await navigate({ to: '/dashboard' })
    },
  })

  const apiError = mutation.error instanceof ApiError ? mutation.error.message : null

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-semibold">{t('login.heading')}</h1>
          <LanguageSwitcher variant="compact" />
        </div>
        <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
          <Field label={t('login.identifier')} htmlFor="identifier" error={errors.identifier?.message}>
            <Input
              id="identifier"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
              {...register('identifier')}
            />
          </Field>
          <Field label={t('login.password')} htmlFor="password" error={errors.password?.message}>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              {...register('password')}
            />
          </Field>
          {apiError ? <p className="text-sm text-red-600">{apiError}</p> : null}
          <Button type="submit" className="w-full" disabled={mutation.isPending}>
            {mutation.isPending ? t('login.submitting') : t('login.submit')}
          </Button>
        </form>
      </div>
    </div>
  )
}
