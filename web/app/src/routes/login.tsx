import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation } from '@tanstack/react-query'
import { lockScroll, unlockScroll } from '@/lib/scrollLock'
import {
  Check,
  ExternalLink,
  Loader2,
  X,
  Sun,
  Moon,
  RefreshCw,
  AlertCircle,
  KeyRound,
} from 'lucide-react'

import {
  login,
  me,
  createWAChallenge,
  pollWAChallenge,
  type WAChallengeInfo,
  getGoogleConfig,
  verifyGoogleCredential,
} from '@/api/auth'
import type { User } from '@/api/types'
import { ApiError, isAuthError } from '@/api/client'
import { ME_QUERY_KEY, useSetMe } from '@/lib/auth'
import { useTranslation } from '@/lib/i18n'
import { useTheme } from '@/lib/theme'
import { cn } from '@/lib/cn'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import { Field } from '@/components/Field'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { ForgotPasswordModal } from '@/components/ForgotPasswordModal'
import { ResetPasswordModal } from '@/components/ResetPasswordModal'
import { WhatsAppIcon } from '@/components/WhatsAppIcon'

export const Route = createFileRoute('/login')({
  beforeLoad: async ({ context }) => {
    try {
      const user = await context.queryClient.fetchQuery({
        queryKey: ME_QUERY_KEY,
        queryFn: me,
      })
      if (user) {
        if (user.role === 'guru' || user.role === 'teacher') {
          throw redirect({ to: '/portal-guru' })
        } else if (user.role === 'murid' || user.role === 'student') {
          throw redirect({ to: '/achievement' })
        } else {
          throw redirect({ to: '/dashboard' })
        }
      }
    } catch (err) {
      if (isAuthError(err)) return
      throw err
    }
  },
  component: LoginPage,
})

type FormValues = {
  identifier: string
  password: string
}



function GoogleIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" className={className}>
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.04 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
      />
    </svg>
  )
}

function WhatsAppLoginModal({
  isOpen,
  onClose,
  onSuccess,
}: {
  isOpen: boolean
  onClose: () => void
  onSuccess: (user: User) => Promise<void>
}) {
  const { t } = useTranslation()
  const [isRendered, setIsRendered] = useState(isOpen)
  const [isClosing, setIsClosing] = useState(false)
  const [challenge, setChallenge] = useState<WAChallengeInfo | null>(null)
  const [status, setStatus] = useState<'loading' | 'waiting' | 'approved' | 'expired' | 'error'>('loading')
  const [checkingManual, setCheckingManual] = useState(false)
  const [manualCheckMsg, setManualCheckMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const initChallenge = useCallback(async () => {
    setStatus('loading')
    setErrorMsg(null)
    setCheckingManual(false)
    setManualCheckMsg(null)
    try {
      const data = await createWAChallenge()
      setChallenge(data)
      setStatus('waiting')
    } catch (err: any) {
      setStatus('error')
      setErrorMsg(err?.message || t('login.waError'))
    }
  }, [t])

  useEffect(() => {
    if (isOpen) {
      setIsRendered(true)
      setIsClosing(false)
      initChallenge()
    } else if (isRendered) {
      setIsClosing(true)
      const timer = setTimeout(() => {
        setIsRendered(false)
        setIsClosing(false)
        setChallenge(null)
        setStatus('loading')
      }, 250)
      return () => clearTimeout(timer)
    }
  }, [isOpen, isRendered, initChallenge])

  const handleDismiss = () => {
    if (isClosing) return
    setIsClosing(true)
    setTimeout(() => {
      onClose()
    }, 250)
  }

  // Polling
  useEffect(() => {
    if (!isOpen || status !== 'waiting' || !challenge) return

    const checkStatus = async () => {
      try {
        const res = await pollWAChallenge(challenge.code, challenge.pollToken)
        if (res.status === 'approved' && res.user) {
          setStatus('approved')
          await onSuccess(res.user)
          return true
        } else if (res.status === 'expired') {
          setStatus('expired')
          return true
        }
      } catch {
        // network glitch, ignore and keep polling
      }
      return false
    }

    const interval = setInterval(async () => {
      const done = await checkStatus()
      if (done) clearInterval(interval)
    }, 2000)

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkStatus()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [isOpen, status, challenge, onSuccess])

  const handleManualCheck = async () => {
    if (!challenge || checkingManual) return
    setCheckingManual(true)
    setManualCheckMsg(null)
    try {
      const res = await pollWAChallenge(challenge.code, challenge.pollToken)
      if (res.status === 'approved' && res.user) {
        setStatus('approved')
        await onSuccess(res.user)
      } else if (res.status === 'expired') {
        setStatus('expired')
      } else {
        setManualCheckMsg(t('login.waNotVerifiedYet'))
      }
    } catch (err: any) {
      setManualCheckMsg(err?.message || t('login.waError'))
    } finally {
      setCheckingManual(false)
    }
  }

  // Escape key closes the modal
  useEffect(() => {
    if (!isRendered) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleDismiss()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isRendered, isClosing])

  // Lock body scroll while open
  useEffect(() => {
    if (!isRendered) return
    lockScroll()
    return () => {
      unlockScroll()
    }
  }, [isRendered])

  if (!isRendered) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wa-modal-title"
    >
      <button
        type="button"
        aria-label={t('common.close')}
        className={cn(
          'fixed inset-0 cursor-default bg-slate-950/70 backdrop-blur-sm',
          isClosing ? 'animate-fade-out' : 'animate-fade-in',
        )}
        onClick={handleDismiss}
      />
      <div
        className={cn(
          'relative z-10 w-full max-w-sm rounded-t-3xl sm:rounded-2xl border-t sm:border border-slate-200/80 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900',
          isClosing
            ? 'animate-slide-down-sheet sm:animate-modal-scale-out'
            : 'animate-slide-up-sheet sm:animate-modal-scale',
        )}
      >
        <div className="mx-auto -mt-2 mb-4 h-1.5 w-12 rounded-full bg-slate-300 dark:bg-slate-700 sm:hidden shrink-0" />
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
              <WhatsAppIcon className="h-5 w-5" />
            </div>
            <h2 id="wa-modal-title" className="text-base font-semibold text-slate-900 dark:text-white">
              {t('login.waModalTitle')}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            className="-mr-1 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300 transition-all duration-150 hover:rotate-90 active:scale-90"
            aria-label={t('common.close')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {status === 'loading' && (
          <div className="flex flex-col items-center justify-center py-10 text-center animate-fade-in">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
              {t('common.loading')}
            </p>
          </div>
        )}

        {status === 'error' && (
          <div className="py-6 text-center space-y-4 animate-scale-in">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 animate-bounce-short">
              <X className="h-6 w-6" />
            </div>
            <p className="text-sm text-red-600 dark:text-red-400">
              {errorMsg || t('login.waError')}
            </p>
            <Button variant="outline" onClick={initChallenge} className="w-full">
              {t('common.apply')}
            </Button>
          </div>
        )}

        {status === 'expired' && (
          <div className="py-6 text-center space-y-4 animate-scale-in">
            <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
              {t('login.waExpired')}
            </p>
            <Button onClick={initChallenge} className="w-full">
              {t('login.waRetryBtn')}
            </Button>
          </div>
        )}

        {status === 'approved' && (
          <div className="flex flex-col items-center justify-center py-8 text-center animate-scale-in">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400 animate-bounce-short shadow-inner">
              <Check className="h-7 w-7 stroke-[2.5]" />
            </div>
            <p className="mt-4 text-base font-semibold text-emerald-600 dark:text-emerald-400">
              {t('login.waSuccess')}
            </p>
          </div>
        )}

        {status === 'waiting' && challenge && (
          <div className="space-y-4 animate-fade-in">
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {t('login.waStep1')}
            </p>

            <div className="space-y-2.5">
              <a
                href={challenge.waLink}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-emerald-600/20 hover:bg-emerald-500 hover:shadow-lg hover:shadow-emerald-600/30 active:scale-[0.98] transition-all duration-200"
              >
                <WhatsAppIcon className="h-5 w-5 transition-transform duration-200 group-hover:scale-110" />
                <span>{t('login.waSendBtn')}</span>
                <ExternalLink className="h-4 w-4 opacity-80 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </a>

              <button
                type="button"
                onClick={handleManualCheck}
                disabled={checkingManual}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-2.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200 dark:hover:bg-slate-700 active:scale-[0.98] transition-all duration-150 disabled:opacity-60"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${checkingManual ? 'animate-spin text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`} />
                <span>{checkingManual ? t('login.waCheckingStatus') : t('login.waCheckStatusBtn')}</span>
              </button>
            </div>

            {manualCheckMsg && (
              <div className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200/80 dark:border-amber-900/50 animate-slide-up">
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                <span>{manualCheckMsg}</span>
              </div>
            )}

            <div className="flex items-center gap-2.5 rounded-lg bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
              <span className="relative flex h-2 w-2 flex-shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
              </span>
              <span>{t('login.waWaitingHint')}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function LoginPage() {
  const navigate = useNavigate()
  const setMe = useSetMe()
  const { t } = useTranslation()
  const { theme, toggleTheme } = useTheme()
  const [isWAModalOpen, setIsWAModalOpen] = useState(false)
  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false)
  const [isResetModalOpen, setIsResetModalOpen] = useState(false)
  const [resetSessionToken, setResetSessionToken] = useState('')
  const [resetUser, setResetUser] = useState<User | null>(null)

  const handleOtpVerified = (token: string, user: User) => {
    setResetSessionToken(token)
    setResetUser(user)
    setIsForgotModalOpen(false)
    setIsResetModalOpen(true)
  }

  const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
  const magicError = urlParams?.get('error')

  const schema = z.object({
    identifier: z.string().min(1, t('login.errIdentifierRequired')),
    password: z.string().min(1, t('login.errPasswordRequired')),
  })

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  const handleLoginSuccess = async (user: User) => {
    setMe(user)
    if (user.role === 'guru' || user.role === 'teacher') {
      await navigate({ to: '/portal-guru' })
    } else if (user.role === 'murid' || user.role === 'student') {
      await navigate({ to: '/achievement' })
    } else {
      await navigate({ to: '/dashboard' })
    }
  }

  const [googleConfig, setGoogleConfig] = useState<{ enabled: boolean; clientId: string } | null>(null)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [googleError, setGoogleError] = useState<string | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [tokenClient, setTokenClient] = useState<any>(null)

  useEffect(() => {
    getGoogleConfig()
      .then((cfg) => setGoogleConfig(cfg))
      .catch(() => setGoogleConfig({ enabled: false, clientId: '' }))
  }, [])

  useEffect(() => {
    if (!googleConfig?.enabled || !googleConfig.clientId) return

    let interval: ReturnType<typeof setInterval> | null = null

    const initClient = () => {
      // @ts-expect-error Google Identity Services global
      const google = window.google
      if (google?.accounts?.oauth2) {
        try {
          const client = google.accounts.oauth2.initTokenClient({
            client_id: googleConfig.clientId,
            scope: 'email profile openid',
            callback: async (tokenResponse: { error?: string; error_description?: string; access_token?: string }) => {
              if (tokenResponse?.error) {
                if (tokenResponse.error !== 'access_denied') {
                  setGoogleError(tokenResponse.error_description || tokenResponse.error)
                }
                setGoogleLoading(false)
                return
              }
              if (tokenResponse?.access_token) {
                setGoogleLoading(true)
                setGoogleError(null)
                try {
                  const user = await verifyGoogleCredential(tokenResponse.access_token)
                  await handleLoginSuccess(user)
                } catch (err: unknown) {
                  const msg = err instanceof Error ? err.message : 'Login dengan Google gagal'
                  setGoogleError(msg)
                } finally {
                  setGoogleLoading(false)
                }
              }
            },
          })
          setTokenClient(client)
          return true
        } catch (e) {
          console.error('GIS oauth2 init error', e)
        }
      }
      return false
    }

    if (!initClient()) {
      interval = setInterval(() => {
        if (initClient() && interval) {
          clearInterval(interval)
        }
      }, 300)
    }

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [googleConfig, handleLoginSuccess])

  const handleGoogleSignIn = () => {
    if (!tokenClient) return
    setGoogleError(null)
    tokenClient.requestAccessToken({ prompt: 'select_account' })
  }

  const mutation = useMutation({
    mutationFn: ({ identifier, password }: FormValues) => login(identifier, password),
    onSuccess: handleLoginSuccess,
  })

  const apiError = mutation.error instanceof ApiError ? mutation.error.message : null

  return (
    <div className="flex min-h-screen items-center justify-center px-4 bg-slate-50 dark:bg-slate-950 transition-colors">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-end gap-1.5 mb-2">
          <button
            type="button"
            onClick={toggleTheme}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition"
            title={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <LanguageSwitcher variant="compact" />
        </div>

        <div className="mb-6 flex flex-col items-center text-center">
          <img
            src="/logo.png"
            alt="PPG US"
            className="h-20 w-20 object-contain rounded-full bg-white dark:bg-slate-800 p-1.5 shadow-sm border border-slate-100 dark:border-slate-700/60 mb-3"
          />
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            PPG US
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {t('login.heading')}
          </p>
        </div>

        {magicError && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
            {magicError === 'token_expired'
              ? 'Tautan login telah kedaluwarsa atau sudah digunakan.'
              : magicError === 'account_archived'
              ? 'Akun dinonaktifkan.'
              : 'Tautan login tidak valid. Silakan masuk kembali.'}
          </div>
        )}

        {googleError && (
          <div className="mb-4 flex items-start gap-2 rounded-xl bg-red-50 p-3 text-xs text-red-700 dark:bg-red-950/50 dark:text-red-300 border border-red-200 dark:border-red-900/50 animate-fade-in">
            <AlertCircle size={15} className="shrink-0 mt-0.5" />
            <span>{googleError}</span>
          </div>
        )}

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
          <div className="space-y-1">
            <label htmlFor="password" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              {t('login.password')}
            </label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              {...register('password')}
            />
            {errors.password?.message ? (
              <p className="text-xs text-red-600 dark:text-red-400">{errors.password.message}</p>
            ) : null}
          </div>
          {apiError ? (
            <div className="flex justify-end -mt-1 animate-fade-in">
              <button
                type="button"
                onClick={() => setIsForgotModalOpen(true)}
                className="text-xs font-semibold text-teal-600 hover:text-teal-700 dark:text-teal-400 hover:underline inline-flex items-center gap-1.5 transition"
              >
                <KeyRound size={13} className="shrink-0" />
                <span>{t('login.forgotPassword') || 'Lupa Password?'}</span>
              </button>
            </div>
          ) : null}
          <Button type="submit" className="w-full" disabled={mutation.isPending}>
            {mutation.isPending ? t('login.submitting') : t('login.submit')}
          </Button>
        </form>

        <div className="relative my-5 flex items-center justify-center">
          <div className="w-full border-t border-slate-200 dark:border-slate-800" />
          <span className="absolute bg-white px-2.5 text-[11px] font-medium text-slate-400 uppercase tracking-wider dark:bg-slate-900 dark:text-slate-500">
            {t('login.waOrDivider')}
          </span>
        </div>

        <div className="space-y-2.5">
          {/* Google Sign In Button */}
          {googleConfig?.enabled ? (
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={googleLoading || !tokenClient}
              className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 active:scale-[0.99] dark:border-slate-700/80 dark:bg-slate-800/80 dark:text-slate-200 dark:hover:bg-slate-700/80 dark:hover:text-white transition shadow-sm disabled:opacity-60"
            >
              {googleLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-slate-500 dark:text-slate-400" />
              ) : (
                <GoogleIcon className="h-5 w-5" />
              )}
              <span>{googleLoading ? 'Memproses Google…' : t('login.loginWithGoogle')}</span>
            </button>
          ) : null}

          {/* WhatsApp Login Button */}
          <button
            type="button"
            onClick={() => setIsWAModalOpen(true)}
            className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-500/20 active:scale-[0.99] dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-300 dark:hover:bg-emerald-500/25 transition shadow-sm"
          >
            <WhatsAppIcon className="h-5 w-5" />
            <span>{t('login.loginWithWA')}</span>
          </button>
        </div>
      </div>

      <WhatsAppLoginModal
        isOpen={isWAModalOpen}
        onClose={() => setIsWAModalOpen(false)}
        onSuccess={handleLoginSuccess}
      />

      <ForgotPasswordModal
        isOpen={isForgotModalOpen}
        onClose={() => setIsForgotModalOpen(false)}
        onOtpVerified={handleOtpVerified}
      />

      <ResetPasswordModal
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        resetSessionToken={resetSessionToken}
        user={resetUser}
        onSuccess={handleLoginSuccess}
      />
    </div>
  )
}
