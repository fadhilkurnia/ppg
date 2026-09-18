import { useState, useEffect, useRef } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Loader2,
} from 'lucide-react'
import { Modal } from './Modal'
import { Button } from './Button'
import {
  createWAResetChallenge,
  pollWAResetStatus,
  verifyWAResetOTP,
} from '@/api/auth'
import type { User, WAResetChallengeResponse } from '@/api/types'

import { WhatsAppIcon } from './WhatsAppIcon'

type Props = {
  isOpen: boolean
  onClose: () => void
  onOtpVerified: (resetSessionToken: string, user: User) => void
}

export function ForgotPasswordModal({
  isOpen,
  onClose,
  onOtpVerified,
}: Props) {
  const [step, setStep] = useState<1 | 2>(1)
  const [challenge, setChallenge] = useState<WAResetChallengeResponse | null>(null)
  const [loadingChallenge, setLoadingChallenge] = useState(false)
  const [challengeError, setChallengeError] = useState<string | null>(null)

  // Segmented 6-digit OTP state
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', ''])
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  // Polling state for background status
  const [pollStatus, setPollStatus] = useState<'pending' | 'otp_sent' | 'verified' | 'consumed' | 'expired'>('pending')
  const [phoneMasked, setPhoneMasked] = useState<string>('')
  const [detectedUser, setDetectedUser] = useState<string>('')

  const [loadingVerify, setLoadingVerify] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch or re-fetch challenge on open
  const initChallenge = async () => {
    setLoadingChallenge(true)
    setChallengeError(null)
    setError(null)
    setStep(1)
    setOtpDigits(['', '', '', '', '', ''])
    setPollStatus('pending')
    setPhoneMasked('')
    setDetectedUser('')

    try {
      const ch = await createWAResetChallenge()
      setChallenge(ch)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal membuat sesi verifikasi WhatsApp'
      setChallengeError(msg)
    } finally {
      setLoadingChallenge(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      initChallenge()
    }
  }, [isOpen])

  // Polling effect while on Step 2
  useEffect(() => {
    if (!isOpen || step !== 2 || !challenge) return

    let isMounted = true
    const checkStatus = async () => {
      try {
        const res = await pollWAResetStatus(challenge.code, challenge.pollToken)
        if (!isMounted) return
        setPollStatus(res.status)
        if (res.phoneMasked) setPhoneMasked(res.phoneMasked)
        if (res.userName) setDetectedUser(res.userName)
      } catch {
        // Silent poll error
      }
    }

    checkStatus()
    const interval = setInterval(checkStatus, 2500)

    return () => {
      isMounted = false
      clearInterval(interval)
    }
  }, [isOpen, step, challenge])

  // Auto-focus first input when entering Step 2
  useEffect(() => {
    if (step === 2) {
      setTimeout(() => {
        inputRefs.current[0]?.focus()
      }, 100)
    }
  }, [step])

  // Handle digit change in segmented input
  const handleDigitChange = (index: number, value: string) => {
    const cleanDigits = value.replace(/\D/g, '')

    if (cleanDigits.length > 1) {
      // User entered multiple digits (e.g. auto-fill)
      const nextDigits = [...otpDigits]
      const chars = cleanDigits.slice(0, 6).split('')
      for (let i = 0; i < 6; i++) {
        nextDigits[i] = chars[i] || ''
      }
      setOtpDigits(nextDigits)
      setError(null)

      const lastIdx = Math.min(chars.length, 5)
      inputRefs.current[lastIdx]?.focus()

      if (chars.length === 6) {
        submitOTP(nextDigits.join(''))
      }
      return
    }

    const nextDigits = [...otpDigits]
    nextDigits[index] = cleanDigits
    setOtpDigits(nextDigits)
    setError(null)

    if (cleanDigits && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }

    const fullOtp = nextDigits.join('')
    if (fullOtp.length === 6) {
      submitOTP(fullOtp)
    }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!otpDigits[index] && index > 0) {
        const nextDigits = [...otpDigits]
        nextDigits[index - 1] = ''
        setOtpDigits(nextDigits)
        inputRefs.current[index - 1]?.focus()
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus()
    } else if (e.key === 'ArrowRight' && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!pasted) return

    const nextDigits = [...otpDigits]
    for (let i = 0; i < 6; i++) {
      nextDigits[i] = pasted[i] || ''
    }
    setOtpDigits(nextDigits)
    setError(null)

    const focusIdx = Math.min(pasted.length, 5)
    inputRefs.current[focusIdx]?.focus()

    if (pasted.length === 6) {
      submitOTP(pasted)
    }
  }

  const submitOTP = async (otpValue: string) => {
    if (!challenge) return
    if (otpValue.length < 6) {
      setError('Masukkan 6 digit kode OTP secara lengkap')
      return
    }

    setLoadingVerify(true)
    setError(null)
    try {
      const res = await verifyWAResetOTP(challenge.code, challenge.pollToken, otpValue)
      if (res.ok && res.resetSessionToken && res.user) {
        onClose()
        onOtpVerified(res.resetSessionToken, res.user)
      } else {
        setError('Kode OTP salah atau tidak valid')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Kode OTP salah atau belum valid'
      setError(msg)
    } finally {
      setLoadingVerify(false)
    }
  }

  const handleManualVerify = (e: React.FormEvent) => {
    e.preventDefault()
    submitOTP(otpDigits.join(''))
  }

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={step === 1 ? 'Lupa Kata Sandi via WhatsApp' : 'Verifikasi Kode OTP WhatsApp'}
      size="md"
    >
      {step === 1 ? (
        <div className="space-y-4">
          {/* Card Penjelasan */}
          <div className="flex items-start gap-3 rounded-2xl bg-emerald-50/70 p-4 text-xs text-slate-700 dark:bg-emerald-950/30 dark:text-slate-200 border border-emerald-200/70 dark:border-emerald-900/40">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white shadow-xs dark:bg-slate-800">
              <WhatsAppIcon className="h-7 w-7 drop-shadow-xs" />
            </div>
            <div className="space-y-1">
              <p className="font-bold text-slate-900 dark:text-white text-sm">
                Kirim Pesan ke Bot WhatsApp PPG
              </p>
              <p className="leading-relaxed text-slate-600 dark:text-slate-300">
                Sistem akan mengenali akun Anda secara otomatis dari nomor WhatsApp pengirim. Bot akan membalas dengan 6-digit kode OTP untuk mereset kata sandi Anda.
              </p>
            </div>
          </div>

          {challengeError && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-700 dark:bg-red-950/50 dark:text-red-300 border border-red-200 dark:border-red-900/50">
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              <span>{challengeError}</span>
            </div>
          )}

          {/* Tombol Utama: Buka WhatsApp dan langsung beralih ke Tahap 2 */}
          <div className="pt-2 space-y-2.5">
            <a
              href={challenge?.waLink || '#'}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                // Begitu tombol diklik, modal langsung beralih ke Tahap 2 (Input OTP)
                setTimeout(() => setStep(2), 300)
              }}
              className={`w-full py-3.5 px-4 rounded-xl font-semibold text-sm text-white flex items-center justify-center gap-2.5 shadow-md shadow-[#25D366]/25 active:scale-[0.98] transition-all ${
                loadingChallenge || !challenge
                  ? 'bg-slate-400 pointer-events-none cursor-not-allowed opacity-70'
                  : 'bg-[#25D366] hover:bg-[#20ba5a]'
              }`}
            >
              {loadingChallenge ? (
                <>
                  <Loader2 size={18} className="animate-spin mr-1" />
                  Menyiapkan Kode Reset…
                </>
              ) : (
                <>
                  <WhatsAppIcon className="h-5 w-5" />
                  <span>Kirim Pesan ke WhatsApp</span>
                  <ExternalLink size={14} className="opacity-80" />
                </>
              )}
            </a>

            {/* Opsi jika user sudah mengirim pesan dari HP lain */}
            {challenge ? (
              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="text-xs font-semibold text-teal-600 hover:text-teal-700 dark:text-teal-400 hover:underline inline-flex items-center gap-1 transition"
                >
                  Sudah mengirim pesan? Masukkan kode OTP →
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <form onSubmit={handleManualVerify} className="space-y-4">
          {/* Status Banner */}
          {pollStatus === 'otp_sent' ? (
            <div className="flex items-start gap-2.5 rounded-xl bg-emerald-50 p-3.5 text-xs text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-900/50 animate-fade-in">
              <CheckCircle2 size={18} className="shrink-0 text-[#25D366] mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-bold">Kode OTP telah dikirimkan!</p>
                <p className="text-emerald-800 dark:text-emerald-300">
                  Bot WhatsApp telah membalas pesan Anda
                  {phoneMasked ? (
                    <> ke nomor <span className="font-mono font-bold">{phoneMasked}</span></>
                  ) : null}
                  {detectedUser ? (
                    <> (Akun: <span className="font-semibold">{detectedUser}</span>)</>
                  ) : null}.
                  Masukkan 6 digit kodenya di bawah:
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2.5 rounded-xl bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-900/70 dark:text-slate-300 border border-slate-200 dark:border-slate-800">
              <Loader2 size={16} className="animate-spin text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-slate-900 dark:text-slate-100">
                  Menunggu pesan WhatsApp Anda…
                </p>
                <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                  Kirim <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{challenge?.messageText || 'RESET'}</span> ke Bot PPG. Kode OTP akan dikirimkan sebagai balasan.
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-700 dark:bg-red-950/50 dark:text-red-300 border border-red-200 dark:border-red-900/50">
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Segmented 6-digit OTP Inputs */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 text-center mb-2">
              Masukkan 6-Digit Kode OTP
            </label>
            <div className="flex justify-center items-center gap-2 sm:gap-2.5">
              {otpDigits.map((digit, idx) => (
                <input
                  key={idx}
                  ref={(el) => {
                    inputRefs.current[idx] = el
                  }}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleDigitChange(idx, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(idx, e)}
                  onPaste={handlePaste}
                  className={`h-13 w-10 sm:h-14 sm:w-12 text-center text-xl sm:text-2xl font-mono font-bold rounded-xl border transition-all focus:outline-hidden ${
                    digit
                      ? 'border-emerald-500 bg-emerald-50/30 dark:bg-emerald-950/20 text-slate-900 dark:text-white shadow-xs'
                      : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white'
                  } focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30`}
                />
              ))}
            </div>
          </div>

          {/* Tombol Verifikasi OTP */}
          <div className="pt-2 space-y-2">
            <Button
              type="submit"
              disabled={loadingVerify || otpDigits.join('').length < 6}
              className="w-full py-3 text-sm font-semibold flex items-center justify-center gap-2"
            >
              {loadingVerify ? (
                <>
                  <Loader2 size={16} className="animate-spin mr-1" />
                  Memverifikasi OTP…
                </>
              ) : (
                <>
                  <KeyRound size={16} className="mr-1" />
                  Verifikasi Kode OTP
                </>
              )}
            </Button>

            <div className="flex items-center justify-between pt-2 text-xs">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 inline-flex items-center gap-1 transition"
              >
                <ArrowLeft size={13} />
                <span>Kembali</span>
              </button>

              {challenge ? (
                <a
                  href={challenge.waLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-teal-600 hover:text-teal-700 dark:text-teal-400 hover:underline inline-flex items-center gap-1 transition"
                >
                  <WhatsAppIcon className="h-3.5 w-3.5" />
                  <span>Kirim ulang via WA</span>
                </a>
              ) : null}
            </div>
          </div>
        </form>
      )}
    </Modal>
  )
}
