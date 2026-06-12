import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { CheckCircle2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { submitPublicAttendance } from '@/api/public'
import type { PublicAttendanceInput } from '@/api/public'
import { Button } from '@/components/Button'
import { PublicAttendanceForm } from '@/components/PublicAttendanceForm'

export const Route = createFileRoute('/absen')({
  component: AbsenPage,
})

function AbsenPage() {
  const { t } = useTranslation()
  const [submitted, setSubmitted] = useState(false)

  const mutation = useMutation({
    mutationFn: (input: PublicAttendanceInput) => submitPublicAttendance(input),
    onSuccess: () => setSubmitted(true),
  })

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <header className="mb-6 text-center">
          <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">
            {t('absen.title')}
          </h1>
          <p className="mt-1 text-xs text-slate-500">{t('absen.required')}</p>
        </header>

        {submitted ? (
          <div className="space-y-4 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" aria-hidden />
            <h2 className="text-lg font-semibold text-slate-900">
              {t('absen.successTitle')}
            </h2>
            <p className="text-sm text-slate-600">
              {t('absen.successMessage', {
                suffix: mutation.data?.submittedPhone ? t('absen.successMessageWithPhone') : '',
              })}
            </p>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                mutation.reset()
                setSubmitted(false)
              }}
            >
              {t('absen.sendAnother')}
            </Button>
          </div>
        ) : (
          <PublicAttendanceForm
            submitLabel={t('absen.form.statusHadir')}
            pending={mutation.isPending}
            error={mutation.error}
            onSubmit={(input) => mutation.mutate(input)}
          />
        )}

        <footer className="mt-8 flex flex-col items-center gap-2 border-t border-slate-200 pt-4 text-sm text-slate-500 sm:flex-row sm:justify-between">
          <a href="/" className="hover:underline">
            {t('absen.back')}
          </a>
          <a
            href="https://wa.me/628972529354"
            target="_blank"
            rel="noreferrer"
            className="hover:underline"
          >
            {t('absen.questions')}
          </a>
        </footer>
      </div>
    </div>
  )
}