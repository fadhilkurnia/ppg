import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { useAuth } from '@/lib/auth'
import { ApiError } from '@/lib/api'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import { Field } from '@/components/Field'
import { useState } from 'react'

type FormValues = { identifier: string; password: string }

export function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const { t } = useTranslation()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Re-derive the resolver per locale so validation messages localize.
  const schema = useMemo(
    () =>
      z.object({
        identifier: z.string().min(1, t('auth.emailOrUsernameRequired')),
        password: z.string().min(1, t('auth.passwordRequired')),
      }),
    [t],
  )
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  const onSubmit = async (v: FormValues) => {
    setPending(true)
    setError(null)
    try {
      await login(v.identifier, v.password)
      navigate('/dashboard')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('auth.loginFailed'))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="mb-6 text-xl font-semibold">{t('auth.loginTitle')}</h1>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Field label={t('auth.emailOrUsername')} htmlFor="identifier" error={errors.identifier?.message}>
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
          <Field label={t('auth.password')} htmlFor="password" error={errors.password?.message}>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              {...register('password')}
            />
          </Field>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? t('auth.processing') : t('auth.loginTitle')}
          </Button>
        </form>
      </div>
    </div>
  )
}
