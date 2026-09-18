import { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  Plus,
  ShieldCheck,
  Trash2,
} from 'lucide-react'

import {
  changeFirstLoginCredentials,
  createLinkWAChallenge,
  deleteUserPhone,
  getGoogleConfig,
  getUserPhones,
  linkGoogleCredential,
  pollWAChallenge,
  setPrimaryPhone,
  type WAChallengeInfo,
} from '@/api/auth'
import { checkUsernameAvailability } from '@/api/users'
import type { User, UserPhone } from '@/api/types'
import { ME_QUERY_KEY } from '@/lib/auth'
import { useTranslation } from '@/lib/i18n'
import { Modal } from './Modal'
import { Field } from './Field'
import { Input } from './Input'
import { Button } from './Button'
import { WhatsAppIcon } from './WhatsAppIcon'

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


function formatCountdown(sec: number) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

type Props = {
  user: User
}

type PendingCredentials = {
  username: string
  newPassword: string
}

export function FirstLoginModal({ user }: Props) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  // Current user state (may update after linking Google or phone)
  const currentUser = user

  // Pending credentials staged for final submission
  const [pendingCredentials, setPendingCredentials] = useState<PendingCredentials | null>(null)

  // Sub-modals visibility
  const [credentialsModalOpen, setCredentialsModalOpen] = useState(false)
  const [googleModalOpen, setGoogleModalOpen] = useState(false)
  const [waModalOpen, setWaModalOpen] = useState(false)

  // Final submission state
  const [completing, setCompleting] = useState(false)
  const [completeError, setCompleteError] = useState<string | null>(null)
  const [successToast, setSuccessToast] = useState<string | null>(null)

  // --- SUB-MODAL 1: Username & Password State ---
  const [formUsername, setFormUsername] = useState(user.username || '')
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle')
  const [usernameMsg, setUsernameMsg] = useState<string | null>(null)
  const [formPassword, setFormPassword] = useState('')
  const [formConfirmPassword, setFormConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [credError, setCredError] = useState<string | null>(null)
  const checkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // --- SUB-MODAL 2: Google OAuth State ---
  const [googleConfig, setGoogleConfig] = useState<{ enabled: boolean; clientId: string } | null>(null)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [googleError, setGoogleError] = useState<string | null>(null)
  const [googleSuccess, setGoogleSuccess] = useState<string | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [tokenClient, setTokenClient] = useState<any>(null)

  // --- SUB-MODAL 3: WhatsApp Multi-Phone State ---
  const { data: userPhones = [], refetch: refetchPhones } = useQuery<UserPhone[]>({
    queryKey: ['user-phones', user.id],
    queryFn: getUserPhones,
  })
  const [waMode, setWaMode] = useState<'list' | 'input' | 'verifying'>('list')
  const [targetPhone, setTargetPhone] = useState('')
  const [waChallenge, setWaChallenge] = useState<WAChallengeInfo | null>(null)
  const [waCountdown, setWaCountdown] = useState(600)
  const [waActionLoading, setWaActionLoading] = useState(false)
  const [waError, setWaError] = useState<string | null>(null)
  const [waSuccess, setWaSuccess] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [checkingManual, setCheckingManual] = useState(false)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Initialize form username when user changes
  useEffect(() => {
    setFormUsername(user.username || '')
  }, [user.username])

  // Load Google Config
  useEffect(() => {
    getGoogleConfig()
      .then((cfg) => setGoogleConfig(cfg))
      .catch(() => setGoogleConfig({ enabled: false, clientId: '' }))
  }, [])

  // Initialize Google Token Client
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
                  const updatedUser = await linkGoogleCredential(tokenResponse.access_token)
                  queryClient.setQueryData(ME_QUERY_KEY, updatedUser)
                  await queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY })
                  setGoogleSuccess('Email Google berhasil ditautkan!')
                  setTimeout(() => {
                    setGoogleModalOpen(false)
                  }, 1200)
                } catch (err: unknown) {
                  const msg = err instanceof Error ? err.message : 'Gagal menautkan akun Google'
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
  }, [googleConfig, queryClient])

  // Handle Username availability checking
  const handleUsernameChange = (val: string) => {
    setFormUsername(val)
    const trimmed = val.trim()
    if (checkTimerRef.current) clearTimeout(checkTimerRef.current)

    if (!trimmed || trimmed.toLowerCase() === (user.username || '').toLowerCase()) {
      setUsernameStatus('idle')
      setUsernameMsg(null)
      return
    }

    if (trimmed.length < 3) {
      setUsernameStatus('taken')
      setUsernameMsg('Minimal 3 karakter')
      return
    }

    setUsernameStatus('checking')
    setUsernameMsg(null)

    checkTimerRef.current = setTimeout(async () => {
      try {
        const res = await checkUsernameAvailability(trimmed, user.id)
        if (res.available) {
          setUsernameStatus('available')
          setUsernameMsg(res.message || 'Username tersedia')
        } else {
          setUsernameStatus('taken')
          setUsernameMsg(res.message || 'Username sudah digunakan')
        }
      } catch {
        setUsernameStatus('idle')
      }
    }, 300)
  }

  // Cleanup debounce timer
  useEffect(() => {
    return () => {
      if (checkTimerRef.current) clearTimeout(checkTimerRef.current)
    }
  }, [])

  // Save credentials from Modal 1
  const handleSaveCredentials = (e: React.FormEvent) => {
    e.preventDefault()
    setCredError(null)

    const trimmedPassword = formPassword.trim()
    if (trimmedPassword.length < 6) {
      setCredError('Password baru minimal 6 karakter')
      return
    }

    if (trimmedPassword !== formConfirmPassword.trim()) {
      setCredError('Konfirmasi password tidak cocok')
      return
    }

    if (usernameStatus === 'taken') {
      setCredError('Username sudah digunakan akun lain')
      return
    }

    const cleanUname = formUsername.trim() || user.username || ''
    setPendingCredentials({
      username: cleanUname,
      newPassword: trimmedPassword,
    })
    setCredentialsModalOpen(false)
  }

  // Google OAuth Trigger
  const handleGoogleLinkClick = () => {
    if (!tokenClient) return
    setGoogleError(null)
    setGoogleSuccess(null)
    tokenClient.requestAccessToken({ prompt: 'select_account' })
  }

  // WhatsApp verification logic
  useEffect(() => {
    if (waMode === 'verifying' && waChallenge) {
      timerRef.current = setInterval(() => {
        setWaCountdown((prev) => {
          if (prev <= 1) {
            if (timerRef.current) clearInterval(timerRef.current)
            if (pollingRef.current) clearInterval(pollingRef.current)
            setWaError('Sesi verifikasi telah kedaluwarsa')
            return 0
          }
          return prev - 1
        })
      }, 1000)

      pollingRef.current = setInterval(async () => {
        try {
          const res = await pollWAChallenge(waChallenge.code, waChallenge.pollToken)
          if (res.status === 'approved') {
            if (timerRef.current) clearInterval(timerRef.current)
            if (pollingRef.current) clearInterval(pollingRef.current)
            setWaSuccess('Nomor WhatsApp berhasil diverifikasi!')
            await refetchPhones()
            await queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY })
            setTimeout(() => {
              setWaMode('list')
              setWaChallenge(null)
              setWaSuccess(null)
            }, 1200)
          } else if (res.status === 'expired') {
            if (timerRef.current) clearInterval(timerRef.current)
            if (pollingRef.current) clearInterval(pollingRef.current)
            setWaError('Sesi verifikasi telah kedaluwarsa')
          }
        } catch {
          // ignore transient errors
        }
      }, 2000)
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [waMode, waChallenge, refetchPhones, queryClient])

  const handleStartWAVerify = async () => {
    const p = targetPhone.trim()
    if (!p) {
      setWaError('Masukkan nomor WhatsApp yang valid')
      return
    }
    setWaActionLoading(true)
    setWaError(null)
    setWaSuccess(null)
    try {
      const challenge = await createLinkWAChallenge(p)
      setWaChallenge(challenge)
      setWaCountdown(600)
      setWaMode('verifying')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal membuat sesi verifikasi WhatsApp'
      setWaError(msg)
    } finally {
      setWaActionLoading(false)
    }
  }

  const handleManualCheckWA = async () => {
    if (!waChallenge || checkingManual) return
    setCheckingManual(true)
    setWaError(null)
    try {
      const res = await pollWAChallenge(waChallenge.code, waChallenge.pollToken)
      if (res.status === 'approved') {
        if (timerRef.current) clearInterval(timerRef.current)
        if (pollingRef.current) clearInterval(pollingRef.current)
        setWaSuccess('Nomor WhatsApp berhasil diverifikasi!')
        await refetchPhones()
        await queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY })
        setTimeout(() => {
          setWaMode('list')
          setWaChallenge(null)
          setWaSuccess(null)
        }, 1200)
      } else {
        setWaError('Pesan verifikasi belum diterima. Pastikan pesan telah terkirim.')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal memeriksa status'
      setWaError(msg)
    } finally {
      setCheckingManual(false)
    }
  }

  const handleSetPrimary = async (phoneId: string) => {
    try {
      await setPrimaryPhone(phoneId)
      await refetchPhones()
      await queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal mengatur nomor utama'
      setWaError(msg)
    }
  }

  const handleDeletePhone = async (phoneId: string) => {
    try {
      await deleteUserPhone(phoneId)
      await refetchPhones()
      await queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal menghapus nomor'
      setWaError(msg)
    }
  }

  const handleCopyWACode = () => {
    if (!waChallenge) return
    navigator.clipboard.writeText(waChallenge.messageText || waChallenge.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Final Complete Submission
  const handleCompleteSetup = async () => {
    if (!pendingCredentials) {
      setCredentialsModalOpen(true)
      return
    }

    setCompleting(true)
    setCompleteError(null)
    try {
      const trimmedUname = pendingCredentials.username.trim()
      const unamePayload =
        trimmedUname && trimmedUname !== (user.username || '') ? trimmedUname : undefined

      const updatedUser = await changeFirstLoginCredentials({
        username: unamePayload,
        newPassword: pendingCredentials.newPassword,
      })

      setSuccessToast('Pengaturan akun berhasil disimpan!')
      queryClient.setQueryData(ME_QUERY_KEY, updatedUser)
      await queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan pengaturan akun'
      setCompleteError(msg)
    } finally {
      setCompleting(false)
    }
  }

  const isPasswordValid = formPassword.length >= 6
  const isMatch = isPasswordValid && formPassword === formConfirmPassword
  const canSaveCreds = isPasswordValid && isMatch && usernameStatus !== 'taken'

  const displayPhones = userPhones.length > 0 ? userPhones : currentUser.phone ? [{ id: 'primary', phone: currentUser.phone, is_primary: true }] : []

  return (
    <>
      {/* ========================================================= */}
      {/* 1. INITIAL VIEW: MAIN FIRST LOGIN MODAL                    */}
      {/* ========================================================= */}
      <Modal
        open={true}
        closable={false}
        size="md"
        title="Pengaturan Akun Baru"
      >
        <div className="space-y-5">
          <div>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Lengkapi pengaturan profil dan keamanan akun Anda sebelum melanjutkan ke dashboard.
            </p>
          </div>

          {completeError && (
            <div className="flex items-center gap-2 rounded-xl bg-red-50 p-3 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300 border border-red-200 dark:border-red-900/50">
              <AlertCircle size={15} className="shrink-0 text-red-500" />
              <span>{completeError}</span>
            </div>
          )}

          {/* Checklist / Card Items */}
          <div className="space-y-3">
            {/* Item 1: Username & Password (Wajib) */}
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900 transition hover:border-slate-300 dark:hover:border-slate-700">
              <div className="flex items-start gap-3 min-w-0">
                <div
                  className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    pendingCredentials
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                      : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400'
                  }`}
                >
                  {pendingCredentials ? <CheckCircle2 size={18} /> : <KeyRound size={18} />}
                </div>
                <div className="min-w-0 pr-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900 dark:text-white">
                      Username & Password
                    </span>
                    <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950/70 dark:text-amber-300">
                      Wajib
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    {pendingCredentials ? (
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                        @{pendingCredentials.username} • Password siap disimpan
                      </span>
                    ) : (
                      <span>@{currentUser.username || 'username'} • Belum diatur</span>
                    )}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCredError(null)
                  setCredentialsModalOpen(true)
                }}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  pendingCredentials
                    ? 'border border-slate-200 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                    : 'bg-teal-600 text-white hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-600'
                }`}
              >
                {pendingCredentials ? 'Ubah' : 'Atur'}
              </button>
            </div>

            {/* Item 2: Email Terdaftar (Opsional) */}
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900 transition hover:border-slate-300 dark:hover:border-slate-700">
              <div className="flex items-start gap-3 min-w-0">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400">
                  <Mail size={18} />
                </div>
                <div className="min-w-0 pr-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900 dark:text-white">
                      Email Akun
                    </span>
                    <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                      Opsional
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    {currentUser.email ? (
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        {currentUser.email}
                      </span>
                    ) : (
                      <span className="italic text-slate-400">Belum ada email</span>
                    )}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setGoogleError(null)
                  setGoogleSuccess(null)
                  setGoogleModalOpen(true)
                }}
                className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition flex items-center gap-1.5"
              >
                <GoogleIcon className="h-3.5 w-3.5" />
                <span>{currentUser.email ? 'Ganti Email' : 'Tambah'}</span>
              </button>
            </div>

            {/* Item 3: Nomor WhatsApp (Opsional) */}
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900 transition hover:border-slate-300 dark:hover:border-slate-700">
              <div className="flex items-start gap-3 min-w-0">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
                  <WhatsAppIcon className="h-5 w-5" />
                </div>
                <div className="min-w-0 pr-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900 dark:text-white">
                      Nomor WhatsApp
                    </span>
                    <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                      Opsional
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5 font-mono">
                    {displayPhones.length > 0 ? (
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        {displayPhones.map((p) => p.phone).join(', ')}
                      </span>
                    ) : (
                      <span className="italic font-sans text-slate-400">Belum ada nomor</span>
                    )}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setWaError(null)
                  setWaSuccess(null)
                  setWaMode('list')
                  setWaModalOpen(true)
                }}
                className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition"
              >
                {displayPhones.length > 0 ? 'Kelola' : 'Tambah'}
              </button>
            </div>
          </div>

          {/* Action Button */}
          <div className="pt-2">
            <Button
              type="button"
              variant="primary"
              onClick={handleCompleteSetup}
              disabled={completing || !pendingCredentials}
              className="w-full justify-center py-2.5 font-semibold shadow-sm gap-2"
            >
              {completing ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Menyimpan Pengaturan…</span>
                </>
              ) : (
                <>
                  <ShieldCheck size={16} />
                  <span>Selesai & Masuk ke Aplikasi</span>
                </>
              )}
            </Button>
            {!pendingCredentials && (
              <p className="mt-2 text-center text-xs text-amber-600 dark:text-amber-400">
                * Harap atur Username & Password terlebih dahulu untuk melanjutkan.
              </p>
            )}
          </div>
        </div>
      </Modal>

      {/* ========================================================= */}
      {/* 2. SUB-MODAL: ATUR USERNAME & PASSWORD                    */}
      {/* ========================================================= */}
      <Modal
        open={credentialsModalOpen}
        onClose={() => setCredentialsModalOpen(false)}
        size="sm"
        title="Atur Username & Password"
      >
        <form onSubmit={handleSaveCredentials} className="space-y-4">
          {credError && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 p-2.5 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300 border border-red-200 dark:border-red-900/50">
              <AlertCircle size={14} className="shrink-0 text-red-500" />
              <span>{credError}</span>
            </div>
          )}

          <Field label="Username">
            <div className="relative">
              <Input
                type="text"
                value={formUsername}
                onChange={(e) => handleUsernameChange(e.target.value)}
                placeholder="nama pengguna"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
              />
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center">
                {usernameStatus === 'checking' && (
                  <Loader2 size={15} className="animate-spin text-slate-400" />
                )}
                {usernameStatus === 'available' && (
                  <CheckCircle2 size={15} className="text-emerald-600" />
                )}
                {usernameStatus === 'taken' && (
                  <AlertCircle size={15} className="text-rose-500" />
                )}
              </div>
            </div>
            {usernameMsg && (
              <p
                className={`mt-1 text-xs ${
                  usernameStatus === 'available'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {usernameMsg}
              </p>
            )}
          </Field>

          <Field label="Password Baru">
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                value={formPassword}
                onChange={(e) => setFormPassword(e.target.value)}
                placeholder="Minimal 6 karakter"
                required
                minLength={6}
                autoComplete="new-password"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </Field>

          <Field label="Konfirmasi Password">
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                value={formConfirmPassword}
                onChange={(e) => setFormConfirmPassword(e.target.value)}
                placeholder="Ulangi password baru"
                required
                minLength={6}
                autoComplete="new-password"
                className="pr-10"
              />
              {formConfirmPassword.length > 0 && (
                <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center">
                  {isMatch ? (
                    <CheckCircle2 size={15} className="text-emerald-600" />
                  ) : (
                    <AlertCircle size={15} className="text-rose-500" />
                  )}
                </div>
              )}
            </div>
            {formConfirmPassword.length > 0 && !isMatch && (
              <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">
                Konfirmasi password tidak cocok
              </p>
            )}
          </Field>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCredentialsModalOpen(false)}
            >
              Batal
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={!canSaveCreds}
            >
              Simpan
            </Button>
          </div>
        </form>
      </Modal>

      {/* ========================================================= */}
      {/* 3. SUB-MODAL: EMAIL & GOOGLE OAUTH                        */}
      {/* ========================================================= */}
      <Modal
        open={googleModalOpen}
        onClose={() => setGoogleModalOpen(false)}
        size="sm"
        title="Email Akun & Google"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Tautkan akun Google untuk memverifikasi email Anda dan mengaktifkan login cepat via Google.
          </p>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
            <span className="text-xs text-slate-500 dark:text-slate-400">Email terdaftar saat ini:</span>
            <div className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">
              {currentUser.email || 'Belum ada email'}
            </div>
          </div>

          {googleError && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 p-2.5 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300 border border-red-200 dark:border-red-900/50">
              <AlertCircle size={14} className="shrink-0 text-red-500" />
              <span>{googleError}</span>
            </div>
          )}

          {googleSuccess && (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-2.5 text-xs text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/50">
              <CheckCircle2 size={14} className="shrink-0 text-emerald-600" />
              <span>{googleSuccess}</span>
            </div>
          )}

          {googleConfig?.enabled ? (
            <button
              type="button"
              onClick={handleGoogleLinkClick}
              disabled={googleLoading || !tokenClient}
              className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 active:scale-[0.99] dark:border-slate-700/80 dark:bg-slate-800/80 dark:text-slate-200 dark:hover:bg-slate-700/80 dark:hover:text-white transition shadow-sm disabled:opacity-60"
            >
              {googleLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
              ) : (
                <GoogleIcon className="h-5 w-5" />
              )}
              <span>{googleLoading ? 'Menghubungkan Google…' : 'Verifikasi dengan Google'}</span>
            </button>
          ) : (
            <p className="text-center text-xs text-slate-400">
              Integrasi Google Sign-In sedang tidak aktif.
            </p>
          )}

          <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
            <Button
              type="button"
              variant="outline"
              onClick={() => setGoogleModalOpen(false)}
            >
              Tutup
            </Button>
          </div>
        </div>
      </Modal>

      {/* ========================================================= */}
      {/* 4. SUB-MODAL: NOMOR WHATSAPP                              */}
      {/* ========================================================= */}
      <Modal
        open={waModalOpen}
        onClose={() => {
          setWaModalOpen(false)
          setWaMode('list')
          setWaChallenge(null)
        }}
        size="sm"
        title="Pengaturan Nomor WhatsApp"
      >
        <div className="space-y-4">
          {waError && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 p-2.5 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300 border border-red-200 dark:border-red-900/50">
              <AlertCircle size={14} className="shrink-0 text-red-500" />
              <span>{waError}</span>
            </div>
          )}

          {waSuccess && (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-2.5 text-xs text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/50">
              <CheckCircle2 size={14} className="shrink-0 text-emerald-600" />
              <span>{waSuccess}</span>
            </div>
          )}

          {/* VIEW: List of Phones */}
          {waMode === 'list' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Nomor WhatsApp yang terhubung dapat digunakan untuk login dan menerima notifikasi bot.
              </p>

              <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                {displayPhones.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-400">
                    Belum ada nomor WhatsApp terdaftar.
                  </div>
                ) : (
                  displayPhones.map((p) => (
                    <div key={p.id} className="flex items-center justify-between p-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-200">
                          {p.phone}
                        </span>
                        {p.is_primary ? (
                          <span className="rounded-md bg-teal-50 px-1.5 py-0.5 text-[10px] font-semibold text-teal-700 dark:bg-teal-950/70 dark:text-teal-300">
                            Utama
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleSetPrimary(p.id)}
                            className="text-[10px] font-medium text-slate-500 hover:text-teal-600 hover:underline"
                          >
                            Jadikan Utama
                          </button>
                        )}
                      </div>
                      {userPhones.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleDeletePhone(p.id)}
                          className="text-slate-400 hover:text-rose-600 p-1"
                          title="Hapus Nomor"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>

              <div className="flex items-center justify-between pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setTargetPhone('')
                    setWaMode('input')
                  }}
                  className="gap-1.5 text-xs"
                >
                  <Plus size={14} />
                  <span>Tambah Nomor Baru</span>
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => setWaModalOpen(false)}
                >
                  Selesai
                </Button>
              </div>
            </div>
          )}

          {/* VIEW: Input Phone */}
          {waMode === 'input' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Masukkan nomor WhatsApp aktif Anda untuk dikirimi kode verifikasi.
              </p>
              <Field label="Nomor WhatsApp">
                <Input
                  type="tel"
                  value={targetPhone}
                  onChange={(e) => setTargetPhone(e.target.value)}
                  placeholder="08123456789 atau 628..."
                  autoFocus
                />
              </Field>
              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setWaMode('list')}
                >
                  Kembali
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  disabled={waActionLoading || !targetPhone.trim()}
                  onClick={handleStartWAVerify}
                  className="gap-1.5"
                >
                  {waActionLoading && <Loader2 size={14} className="animate-spin" />}
                  <span>Kirim Verifikasi</span>
                </Button>
              </div>
            </div>
          )}

          {/* VIEW: Verifying Challenge */}
          {waMode === 'verifying' && waChallenge && (
            <div className="space-y-3">
              <div className="rounded-xl bg-teal-50/70 p-3 dark:bg-teal-950/30 border border-teal-200/70 dark:border-teal-800/40">
                <p className="text-xs text-teal-800 dark:text-teal-200">
                  Kirim pesan verifikasi berikut ke nomor bot WhatsApp:
                </p>
                <div className="mt-2 flex items-center justify-between rounded-lg bg-white p-2 font-mono text-xs font-semibold text-slate-800 dark:bg-slate-900 dark:text-slate-200 border border-slate-200 dark:border-slate-800">
                  <span>{waChallenge.messageText || waChallenge.code}</span>
                  <button
                    type="button"
                    onClick={handleCopyWACode}
                    className="flex items-center gap-1 text-[11px] text-teal-600 hover:text-teal-700 font-sans"
                  >
                    {copied ? <Check size={13} /> : <Copy size={13} />}
                    <span>{copied ? 'Tersalin' : 'Salin'}</span>
                  </button>
                </div>
              </div>

              {waChallenge.waLink && (
                <a
                  href={waChallenge.waLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 transition"
                >
                  <WhatsAppIcon className="h-4 w-4" />
                  <span>Buka WhatsApp Sekarang</span>
                  <ExternalLink size={13} />
                </a>
              )}

              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 px-1">
                <span className="flex items-center gap-1">
                  <Loader2 size={13} className="animate-spin text-teal-600" />
                  <span>Menunggu bot…</span>
                </span>
                <span className="font-mono text-amber-600 font-semibold">
                  {formatCountdown(waCountdown)}
                </span>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setWaMode('list')
                    setWaChallenge(null)
                  }}
                >
                  Batal
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={checkingManual}
                  onClick={handleManualCheckWA}
                  className="gap-1 text-xs"
                >
                  {checkingManual && <Loader2 size={13} className="animate-spin" />}
                  <span>Cek Status</span>
                </Button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* ========================================================= */}
      {/* SUCCESS TOAST                                             */}
      {/* ========================================================= */}
      {successToast && (
        <div className="fixed bottom-6 right-6 z-[110] flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-medium text-white shadow-xl animate-slide-up-sheet">
          <CheckCircle2 size={18} />
          <span>{successToast}</span>
        </div>
      )}
    </>
  )
}
