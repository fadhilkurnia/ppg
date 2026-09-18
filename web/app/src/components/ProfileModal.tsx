import { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  Plus,
  Trash2,
} from 'lucide-react'
import { updateUser, setUserPassword, checkUsernameAvailability } from '@/api/users'
import {
  createLinkWAChallenge,
  deleteWAPhone,
  deleteUserPhone,
  getUserPhones,
  pollWAChallenge,
  setPrimaryPhone,
  type WAChallengeInfo,
} from '@/api/auth'
import type { User, UserPhone } from '@/api/types'
import { ME_QUERY_KEY } from '@/lib/auth'
import { useTranslation } from '@/lib/i18n'
import { cn } from '@/lib/cn'
import { Modal } from './Modal'
import { Field } from './Field'
import { Input } from './Input'
import { Button } from './Button'

import { WhatsAppIcon } from './WhatsAppIcon'
export { WhatsAppIcon }

function formatCountdown(sec: number) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

type Props = {
  open: boolean
  onClose: () => void
  user: User | null | undefined
}

export function ProfileModal({ open, onClose, user }: Props) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const [name, setName] = useState('')
  const [nickname, setNickname] = useState('')
  const [username, setUsername] = useState('')
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle')
  const [usernameMsg, setUsernameMsg] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [daerah, setDaerah] = useState('')
  const [desa, setDesa] = useState('')
  const [kelompok, setKelompok] = useState('')

  const [changePass, setChangePass] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // WhatsApp states & multi-phone
  const { data: userPhones = [], refetch: refetchPhones } = useQuery<UserPhone[]>({
    queryKey: ['user-phones', user?.id],
    queryFn: getUserPhones,
    enabled: open && !!user,
  })
  const [phoneToDelete, setPhoneToDelete] = useState<UserPhone | null>(null)

  const [waMode, setWaMode] = useState<'idle' | 'input' | 'verifying'>('idle')
  const [targetPhone, setTargetPhone] = useState('')
  const [waChallenge, setWaChallenge] = useState<WAChallengeInfo | null>(null)
  const [waCountdown, setWaCountdown] = useState(600)
  const [waActionLoading, setWaActionLoading] = useState(false)
  const [waError, setWaError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const checkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (user && open) {
      setName(user.name || '')
      setNickname(user.nickname || '')
      setUsername(user.username || '')
      setUsernameStatus('idle')
      setUsernameMsg(null)
      setEmail(user.email || '')
      setDaerah(user.daerah || '')
      setDesa(user.desa || '')
      setKelompok(user.kelompok || '')
      setChangePass(false)
      setNewPassword('')
      setConfirmPassword('')
      setError(null)
      setSuccess(null)

      setWaMode('idle')
      setTargetPhone('')
      setWaChallenge(null)
      setWaError(null)
      setPhoneToDelete(null)
      setCopied(false)
    }
  }, [user, open])

  const handleUsernameChange = (val: string) => {
    setUsername(val)
    const trimmed = val.trim()
    if (checkTimerRef.current) clearTimeout(checkTimerRef.current)

    if (!trimmed || trimmed === (user?.username || '')) {
      setUsernameStatus('idle')
      setUsernameMsg(null)
      return
    }

    if (trimmed.length < 3) {
      setUsernameStatus('taken')
      setUsernameMsg(t('common.tooShort') || 'Minimal 3 karakter')
      return
    }

    setUsernameStatus('checking')
    setUsernameMsg(null)

    checkTimerRef.current = setTimeout(async () => {
      try {
        const res = await checkUsernameAvailability(trimmed, user?.id)
        if (res.available) {
          setUsernameStatus('available')
          setUsernameMsg(res.message || t('profile.usernameAvailable'))
        } else {
          setUsernameStatus('taken')
          setUsernameMsg(res.message || t('profile.usernameTaken'))
        }
      } catch {
        setUsernameStatus('idle')
      }
    }, 350)
  }

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  // Timer countdown
  useEffect(() => {
    if (waMode === 'verifying' && waChallenge) {
      timerRef.current = setInterval(() => {
        setWaCountdown((prev) => {
          if (prev <= 1) {
            if (timerRef.current) clearInterval(timerRef.current)
            if (pollingRef.current) clearInterval(pollingRef.current)
            setWaError(t('login.waExpired') || 'Sesi verifikasi telah kedaluwarsa')
            return 0
          }
          return prev - 1
        })
      }, 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [waMode, waChallenge, t])

  // Polling
  useEffect(() => {
    if (waMode === 'verifying' && waChallenge) {
      pollingRef.current = setInterval(async () => {
        try {
          const res = await pollWAChallenge(waChallenge.code, waChallenge.pollToken)
          if (res.status === 'approved') {
            if (pollingRef.current) clearInterval(pollingRef.current)
            if (timerRef.current) clearInterval(timerRef.current)
            await Promise.all([
              refetchPhones(),
              queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY }),
            ])
            setSuccess(t('profile.waVerifySuccess'))
            setWaMode('idle')
            setWaChallenge(null)
            setTargetPhone('')
          } else if (res.status === 'expired') {
            if (pollingRef.current) clearInterval(pollingRef.current)
            if (timerRef.current) clearInterval(timerRef.current)
            setWaError(t('login.waExpired') || 'Sesi verifikasi telah kedaluwarsa')
          }
        } catch {
          // ignore transient poll error
        }
      }, 2500)
    } else {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [waMode, waChallenge, queryClient, refetchPhones, t])

  if (!user) return null

  const handleCopy = (text: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleStartVerification = async () => {
    const raw = targetPhone.trim()
    if (!raw) {
      setWaError(t('profile.waInputHelp'))
      return
    }
    const digitsOnly = raw.replace(/\D/g, '')
    if (digitsOnly.length < 8) {
      setWaError('Format nomor WhatsApp minimal 8 digit angka')
      return
    }

    setWaActionLoading(true)
    setWaError(null)
    try {
      const challengeData = await createLinkWAChallenge(raw)
      setWaChallenge(challengeData)
      setWaCountdown(600)
      setWaMode('verifying')

      if (challengeData.waLink) {
        window.open(challengeData.waLink, '_blank', 'noopener,noreferrer')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal membuat sesi verifikasi WhatsApp'
      setWaError(msg)
    } finally {
      setWaActionLoading(false)
    }
  }

  const handleSetPrimary = async (phoneId: string) => {
    setWaActionLoading(true)
    setWaError(null)
    try {
      await setPrimaryPhone(phoneId)
      await Promise.all([
        refetchPhones(),
        queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY }),
      ])
      setSuccess('Nomor WhatsApp utama berhasil diubah')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal mengubah nomor utama'
      setWaError(msg)
    } finally {
      setWaActionLoading(false)
    }
  }

  const handleDeletePhoneItem = async (phoneId: string) => {
    setWaActionLoading(true)
    setWaError(null)
    try {
      await deleteUserPhone(phoneId)
      await Promise.all([
        refetchPhones(),
        queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY }),
      ])
      setSuccess('Nomor WhatsApp berhasil dihapus')
      setPhoneToDelete(null)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal menghapus nomor WhatsApp'
      setWaError(msg)
    } finally {
      setWaActionLoading(false)
    }
  }

  const handleDeletePhone = async () => {
    setWaActionLoading(true)
    setWaError(null)
    try {
      await deleteWAPhone()
      await Promise.all([
        refetchPhones(),
        queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY }),
      ])
      setSuccess(t('profile.waDeleteSuccess'))
      setPhoneToDelete(null)
      setWaMode('idle')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal menghapus nomor WhatsApp'
      setWaError(msg)
    } finally {
      setWaActionLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (!name.trim()) {
      setError('Nama wajib diisi')
      return
    }
    if (!email.trim()) {
      setError('Email wajib diisi')
      return
    }

    if (changePass) {
      if (!newPassword || newPassword.length < 6) {
        setError('Kata sandi baru minimal 6 karakter')
        return
      }
      if (newPassword !== confirmPassword) {
        setError('Konfirmasi kata sandi tidak cocok')
        return
      }
    }

    if (usernameStatus === 'checking') {
      setError('Sedang memeriksa ketersediaan username...')
      return
    }
    if (usernameStatus === 'taken') {
      setError(usernameMsg || 'Username sudah digunakan')
      return
    }

    setLoading(true)
    try {
      await updateUser(user.id, {
        name: name.trim(),
        nickname: nickname.trim() || undefined,
        username: username.trim() || undefined,
        email: email.trim(),
        daerah: daerah.trim() || undefined,
        desa: desa.trim() || undefined,
        kelompok: kelompok.trim() || undefined,
      })

      if (changePass && newPassword) {
        await setUserPassword(user.id, {
          newPassword,
        })
      }

      await queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY })
      await queryClient.invalidateQueries({ queryKey: ['teachers'] })
      setSuccess(t('profile.saveSuccess'))
      setTimeout(() => {
        onClose()
      }, 700)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('settings.saveError')
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('profile.myProfile')} size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
            {success}
          </div>
        )}

        <div className="flex items-center gap-2 pb-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {t('profile.role')}:
          </span>
          <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-800 dark:bg-slate-800 dark:text-slate-200">
            {user.role}
          </span>
        </div>

        <Field label={t('profile.name')}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="John Doe"
          />
        </Field>

        <Field label={t('profile.nickname')}>
          <Input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="Ahmad"
          />
        </Field>

        <Field label={t('profile.email')}>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="john@example.com"
          />
        </Field>

        {(user.role === 'guru' || user.role === 'teacher' || user.role === 'admin') && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t('profile.daerah')}>
              <Input
                value={daerah}
                onChange={(e) => setDaerah(e.target.value)}
                placeholder="Cikarang"
              />
            </Field>
            <Field label={t('profile.desa')}>
              <Input
                value={desa}
                onChange={(e) => setDesa(e.target.value)}
                placeholder="Jababeka"
              />
            </Field>
            <Field label={t('profile.kelompok')}>
              <Input
                value={kelompok}
                onChange={(e) => setKelompok(e.target.value)}
                placeholder="JB1"
              />
            </Field>
          </div>
        )}

        {/* WhatsApp Management Section */}
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              {t('profile.waTitle')}
            </label>
            {waMode === 'idle' && (userPhones.length > 0 || user.phone) && (
              <button
                type="button"
                onClick={() => {
                  setWaMode('input')
                  setTargetPhone('')
                  setWaError(null)
                }}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#25D366] hover:text-[#20ba5a] dark:text-[#25D366] transition-colors"
              >
                <Plus size={14} />
                <span>Tambah Nomor</span>
              </button>
            )}
          </div>

          {/* Mode: Idle (view existing or prompt to add) */}
          {waMode === 'idle' && (
            <>
              {userPhones.length > 0 || user.phone ? (
                <div className="space-y-2">
                  <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-slate-50/75 dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900/40">
                    {(userPhones.length > 0
                      ? userPhones
                      : [
                          {
                            id: 'legacy_' + user.id,
                            userId: user.id,
                            phone: user.phone || '',
                            isPrimary: true,
                            verifiedAt: new Date(),
                            createdAt: new Date(),
                          } as unknown as UserPhone,
                        ]
                    ).map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between gap-2.5 p-3 sm:p-3.5"
                      >
                        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                          <WhatsAppIcon className="h-7 w-7 sm:h-8 sm:w-8 shrink-0 drop-shadow-xs" />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                              <span className="font-mono text-sm sm:text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
                                {p.phone}
                              </span>
                              {p.isPrimary ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 shrink-0">
                                  <CheckCircle2 size={12} />
                                  Utama
                                </span>
                              ) : (
                                <span className="inline-flex items-center rounded-full bg-slate-200/80 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400 shrink-0">
                                  Tambahan
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                          {!p.isPrimary && (
                            <button
                              type="button"
                              onClick={() => handleSetPrimary(p.id)}
                              disabled={waActionLoading}
                              className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700/60 shadow-xs transition-colors"
                            >
                              Jadikan Utama
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setPhoneToDelete(p)}
                            disabled={waActionLoading}
                            className="inline-flex items-center justify-center gap-1 rounded-lg border border-red-200 bg-white p-1.5 sm:px-2.5 sm:py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 dark:border-red-900/40 dark:bg-slate-800 dark:text-red-400 dark:hover:bg-red-950/30 shadow-xs transition-colors"
                            title={t('profile.waDelete')}
                          >
                            <Trash2 size={13} className="shrink-0" />
                            <span className="hidden sm:inline">{t('profile.waDelete')}</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {phoneToDelete && (
                    <div className="rounded-md border border-red-200 bg-red-50/80 p-3 dark:border-red-900/50 dark:bg-red-950/40 space-y-2">
                      <p className="text-xs text-red-800 dark:text-red-200">
                        Apakah Anda yakin ingin menghapus nomor WhatsApp <span className="font-mono font-bold">{phoneToDelete.phone}</span> dari akun ini?
                      </p>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setPhoneToDelete(null)}
                          disabled={waActionLoading}
                          className="rounded px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:bg-slate-800"
                        >
                          {t('profile.waCancel')}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (phoneToDelete.id.startsWith('legacy_')) {
                              handleDeletePhone()
                            } else {
                              handleDeletePhoneItem(phoneToDelete.id)
                            }
                          }}
                          disabled={waActionLoading}
                          className="inline-flex items-center gap-1.5 rounded bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          {waActionLoading && <Loader2 size={12} className="animate-spin" />}
                          {t('profile.waDelete')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-3 sm:p-3.5 dark:border-slate-700 dark:bg-slate-900/40">
                  <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                    <WhatsAppIcon className="h-8 w-8 sm:h-9 sm:w-9 shrink-0 opacity-60" />
                    <span className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400">
                      {t('profile.waNotSet')}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setWaMode('input')
                      setTargetPhone('')
                      setWaError(null)
                    }}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#25D366] px-3 sm:px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[#20ba5a] active:scale-[0.98] transition-all shrink-0"
                  >
                    <Plus size={14} />
                    <span>{t('profile.waAdd')}</span>
                  </button>
                </div>
              )}
            </>
          )}

          {/* Mode: Input Target Phone */}
          {waMode === 'input' && (
            <div className="space-y-3 rounded-lg border border-teal-200 bg-teal-50/40 p-3.5 dark:border-teal-900/60 dark:bg-teal-950/20">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-teal-900 dark:text-teal-200">
                  Tambah Nomor WhatsApp
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setWaMode('idle')
                    setWaError(null)
                  }}
                  className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400"
                >
                  {t('profile.waCancel')}
                </button>
              </div>

              <div>
                <Field label={t('profile.waInputLabel')} error={waError || undefined}>
                  <Input
                    type="tel"
                    value={targetPhone}
                    onChange={(e) => setTargetPhone(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleStartVerification()
                      }
                    }}
                    placeholder={t('profile.waInputPlaceholder')}
                    autoFocus
                  />
                </Field>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  {t('profile.waInputHelp')}
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setWaMode('idle')
                    setWaError(null)
                  }}
                  disabled={waActionLoading}
                  className="rounded-md px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200/50 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  {t('profile.waCancel')}
                </button>
                <button
                  type="button"
                  disabled={!targetPhone.trim() || waActionLoading}
                  onClick={handleStartVerification}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[#25D366] px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-[#20ba5a] disabled:opacity-50 transition-colors"
                >
                  {waActionLoading ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <WhatsAppIcon className="h-4 w-4" />
                  )}
                  {t('profile.waVerifyBtn')}
                </button>
              </div>
            </div>
          )}

          {/* Mode: Verifying Challenge */}
          {waMode === 'verifying' && waChallenge && (
            <div className="space-y-3 rounded-lg border border-teal-200 bg-teal-50/50 p-4 dark:border-teal-900/60 dark:bg-teal-950/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin text-[#25D366]" />
                  <span className="text-xs font-semibold text-teal-900 dark:text-teal-200">
                    {t('profile.waWaiting')}
                  </span>
                </div>
                <span className="font-mono text-xs font-medium text-slate-500 dark:text-slate-400">
                  {formatCountdown(waCountdown)}
                </span>
              </div>

              <div className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
                <p className="font-semibold text-slate-800 dark:text-slate-200">
                  Langkah Verifikasi:
                </p>
                <ol className="list-decimal pl-4 space-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                  <li>{t('profile.waStep1')}</li>
                  <li>{t('profile.waStep2')}</li>
                  <li>{t('profile.waStep3')}</li>
                </ol>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 rounded-md bg-white p-3 border border-slate-200 shadow-sm dark:bg-slate-900 dark:border-slate-800">
                <div className="space-y-0.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Pesan Verifikasi
                  </span>
                  <div className="font-mono text-xs font-bold text-slate-900 dark:text-slate-100">
                    {waChallenge.messageText}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopy(waChallenge.messageText)}
                    className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  >
                    {copied ? (
                      <Check size={12} className="text-emerald-500" />
                    ) : (
                      <Copy size={12} />
                    )}
                    {copied ? t('profile.waCopied') : t('profile.waCopyCode')}
                  </button>
                  <a
                    href={waChallenge.waLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded bg-[#25D366] px-3 py-1 text-xs font-semibold text-white shadow hover:bg-[#20ba5a]"
                  >
                    <WhatsAppIcon className="h-3.5 w-3.5" />
                    {t('profile.waOpenBtn')}
                    <ExternalLink size={11} />
                  </a>
                </div>
              </div>

              {waError && (
                <div className="rounded-md bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/50 dark:text-red-300">
                  {waError}
                </div>
              )}

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setWaMode('idle')
                    setWaChallenge(null)
                    setWaError(null)
                  }}
                  className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400"
                >
                  {t('profile.waCancel')}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-slate-200 pt-3 dark:border-slate-800 space-y-4">
          <Field label={t('profile.username')}>
            <div className="relative">
              <Input
                value={username}
                onChange={(e) => handleUsernameChange(e.target.value)}
                placeholder="johndoe"
                className={cn(
                  'pr-9',
                  usernameStatus === 'taken' && 'border-red-500 focus:border-red-500 focus:ring-red-500',
                  usernameStatus === 'available' && 'border-emerald-500 focus:border-emerald-500 focus:ring-emerald-500'
                )}
              />
              <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                {usernameStatus === 'checking' && <Loader2 size={15} className="animate-spin text-slate-400" />}
                {usernameStatus === 'available' && <Check size={15} className="text-emerald-500" />}
                {usernameStatus === 'taken' && <span className="text-xs text-red-500 font-bold">✕</span>}
              </div>
            </div>
            {usernameMsg && (
              <p
                className={cn(
                  'mt-1 text-xs',
                  usernameStatus === 'available'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-red-500 dark:text-red-400'
                )}
              >
                {usernameMsg}
              </p>
            )}
          </Field>

          <div className="pt-1">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {t('profile.changePassword')}
              </span>
              <button
                type="button"
                onClick={() => setChangePass(!changePass)}
                className="text-xs font-semibold text-teal-600 hover:text-teal-700 dark:text-teal-400"
              >
                {changePass ? t('common.cancel') : t('profile.changePassword')}
              </button>
            </div>

          {changePass && (
            <div className="mt-3 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/40">
              <Field label={t('profile.newPassword')}>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimal 6 karakter"
                  autoFocus
                />
              </Field>
              <Field label={t('profile.confirmPassword')}>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Ulangi kata sandi baru"
                />
              </Field>
            </div>
          )}
        </div>
      </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
