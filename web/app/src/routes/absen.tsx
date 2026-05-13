import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { CheckCircle2 } from 'lucide-react'

import { submitPublicAttendance } from '@/api/public'
import type { PublicAttendanceInput } from '@/api/public'
import { Button } from '@/components/Button'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { PublicAttendanceForm } from '@/components/PublicAttendanceForm'
import { useTranslation } from '@/i18n'

export const Route = createFileRoute('/absen')({
  component: AbsenPage,
})

function AbsenPage() {
  const [submitted, setSubmitted] = useState(false)
  const { t } = useTranslation()

  const mutation = useMutation({
    mutationFn: (input: PublicAttendanceInput) => submitPublicAttendance(input),
    onSuccess: (data) => {
      setSubmitted(true)
      // Same-tab navigation to wa.me hands off to the WhatsApp app on mobile
      // (via the OS intent) or to WhatsApp Web on desktop, with the report
      // pre-filled. window.open from an async onSuccess gets swallowed by
      // popup blockers — a same-tab navigation does not.
      if (data.waMeUrl) {
        window.location.href = data.waMeUrl
      }
    },
  })

  const waMeUrl = mutation.data?.waMeUrl ?? ''

  return (
    <div className="min-h-screen bg-slate-50 px-3 py-6 sm:px-4 sm:py-12">
      <div className="mx-auto w-full max-w-xl rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        <header className="mb-6 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold leading-tight text-slate-900 sm:text-2xl">
              {t('absen.heading')}
            </h1>
            <p className="mt-1.5 text-sm text-slate-500">{t('absen.note')}</p>
          </div>
          <LanguageSwitcher variant="compact" />
        </header>

        {submitted ? (
          <div className="space-y-5 text-center">
            <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" aria-hidden />
            <h2 className="text-lg font-semibold text-slate-900">
              {t('absen.successHeading')}
            </h2>
            {waMeUrl ? (
              <>
                <p className="text-base text-slate-600 sm:text-sm">{t('absen.successWaHint')}</p>
                <a
                  href={waMeUrl}
                  className="inline-flex h-12 w-full items-center justify-center rounded-md bg-emerald-600 px-4 text-base font-medium text-white shadow-sm hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 sm:h-11 sm:text-sm"
                >
                  {t('absen.sendWa')}
                </a>
              </>
            ) : (
              <p className="text-base text-slate-600 sm:text-sm">{t('absen.savedToDb')}</p>
            )}
            <Button
              type="button"
              variant="secondary"
              className="h-12 w-full text-base sm:h-10 sm:w-auto sm:text-sm"
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
            submitLabel={t('absen.submitBtn')}
            pending={mutation.isPending}
            error={mutation.error}
            onSubmit={(input) => mutation.mutate(input)}
          />
        )}

        <footer className="mt-8 flex flex-col items-center gap-3 border-t border-slate-200 pt-5 text-sm text-slate-500 sm:flex-row sm:justify-between sm:gap-2 sm:pt-4">
          <a href="/" className="hover:underline">
            {t('absen.back')}
          </a>
          <a
            href="https://wa.me/628972529354"
            target="_blank"
            rel="noreferrer"
            className="hover:underline"
          >
            {t('absen.hasQuestion')}
          </a>
        </footer>
      </div>
    </div>
  )
}
