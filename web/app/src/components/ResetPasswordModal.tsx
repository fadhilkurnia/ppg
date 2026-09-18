import { useState, useEffect } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  UserCheck,
} from 'lucide-react'
import { Modal } from './Modal'
import { Field } from './Field'
import { Input } from './Input'
import { Button } from './Button'
import { completeWAResetPassword } from '@/api/auth'
import type { User } from '@/api/types'

type Props = {
  isOpen: boolean
  onClose: () => void
  resetSessionToken: string
  user: User | null
  onSuccess: (user: User) => Promise<void>
}

export function ResetPasswordModal({
  isOpen,
  onClose,
  resetSessionToken,
  user,
  onSuccess,
}: Props) {
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      setNewPassword('')
      setConfirmPassword('')
      setShowPassword(false)
      setError(null)
      setSuccessMsg(null)
      setLoading(false)
    }
  }, [isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!newPassword || newPassword.length < 6) {
      setError('Kata sandi baru minimal 6 karakter')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('Konfirmasi kata sandi tidak cocok')
      return
    }

    setLoading(true)
    try {
      const updatedUser = await completeWAResetPassword({
        resetSessionToken,
        newPassword,
        confirmPassword,
      })

      setSuccessMsg('Kata sandi berhasil disimpan! Mengalihkan ke dashboard...')
      setTimeout(async () => {
        onClose()
        await onSuccess(updatedUser)
      }, 700)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan kata sandi baru'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const roleLabel =
    user?.role === 'guru' || user?.role === 'teacher'
      ? 'Guru / Pengajar'
      : user?.role === 'murid' || user?.role === 'student'
      ? 'Murid / Generus'
      : user?.role === 'admin'
      ? 'Administrator'
      : 'Pengguna'

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="Atur Kata Sandi Baru"
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Banner Info Akun yang Terdeteksi */}
        <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3.5 text-xs text-slate-700 dark:bg-slate-900/70 dark:text-slate-200 border border-slate-200 dark:border-slate-800">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-500/10 text-teal-600 dark:bg-teal-500/20 dark:text-teal-400">
            <UserCheck size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="font-bold text-slate-900 dark:text-white truncate text-sm">
                {user?.name || 'Akun Anda'}
              </p>
              <span className="inline-flex items-center rounded-md bg-teal-50 px-2 py-0.5 text-[10px] font-medium text-teal-700 ring-1 ring-inset ring-teal-600/20 dark:bg-teal-950/50 dark:text-teal-300 dark:ring-teal-500/30">
                {roleLabel}
              </span>
            </div>
            <p className="text-slate-500 dark:text-slate-400 truncate mt-0.5">
              @{user?.username || user?.email || 'user'}
            </p>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-700 dark:bg-red-950/50 dark:text-red-300 border border-red-200 dark:border-red-900/50">
            <AlertCircle size={15} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/50">
            <CheckCircle2 size={15} className="shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        <Field label="Kata Sandi Baru">
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
              <Lock size={16} />
            </div>
            <Input
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Minimal 6 karakter"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="pl-9 pr-10"
              required
              minLength={6}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </Field>

        <Field label="Konfirmasi Kata Sandi Baru">
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
              <KeyRound size={16} />
            </div>
            <Input
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Ulangi kata sandi baru"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="pl-9 pr-10"
              required
              minLength={6}
            />
          </div>
        </Field>

        <div className="pt-2">
          <Button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 text-sm font-semibold flex items-center justify-center gap-2 shadow-sm"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin mr-1" />
                Menyimpan Kata Sandi…
              </>
            ) : (
              <>
                <Lock size={16} className="mr-1" />
                Simpan Password & Masuk
              </>
            )}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
