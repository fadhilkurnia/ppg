import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { CheckCircle2 } from 'lucide-react'

import { submitPublicAttendance } from '@/api/public'
import type { PublicAttendanceInput } from '@/api/public'
import { Button } from '@/components/Button'
import { PublicAttendanceForm } from '@/components/PublicAttendanceForm'

export const Route = createFileRoute('/absen')({
  component: AbsenPage,
})

function AbsenPage() {
  const [submitted, setSubmitted] = useState(false)

  const mutation = useMutation({
    mutationFn: (input: PublicAttendanceInput) => submitPublicAttendance(input),
    onSuccess: () => setSubmitted(true),
  })

  const waMeUrl = mutation.data?.waMeUrl ?? ''

  // Auto-open the wa.me URL right after a successful submit so WhatsApp
  // pops up with the formatted report pre-filled. The "Kirim ke WhatsApp"
  // button is the fallback for users whose pop-up blocker swallows the
  // window.open call.
  useEffect(() => {
    if (submitted && waMeUrl) {
      window.open(waMeUrl, '_blank', 'noopener,noreferrer')
    }
  }, [submitted, waMeUrl])

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <header className="mb-6 text-center">
          <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">
            Form Kegiatan Pengajian
          </h1>
          <p className="mt-1 text-xs text-slate-500">*Semua data wajib diisi!</p>
        </header>

        {submitted ? (
          <div className="space-y-4 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" aria-hidden />
            <h2 className="text-lg font-semibold text-slate-900">
              Laporan tersimpan, terima kasih!
            </h2>
            {waMeUrl ? (
              <>
                <p className="text-sm text-slate-600">
                  Klik tombol di bawah untuk mengirim laporan via WhatsApp ke admin.
                </p>
                <a
                  href={waMeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-10 w-full items-center justify-center rounded-md bg-emerald-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                >
                  Kirim ke WhatsApp
                </a>
              </>
            ) : (
              <p className="text-sm text-slate-600">
                Laporan sudah disimpan di database.
              </p>
            )}
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                mutation.reset()
                setSubmitted(false)
              }}
            >
              Kirim laporan lain
            </Button>
          </div>
        ) : (
          <PublicAttendanceForm
            submitLabel="KIRIM LAPORAN"
            pending={mutation.isPending}
            error={mutation.error}
            onSubmit={(input) => mutation.mutate(input)}
          />
        )}

        <footer className="mt-8 flex flex-col items-center gap-2 border-t border-slate-200 pt-4 text-sm text-slate-500 sm:flex-row sm:justify-between">
          <a href="/" className="hover:underline">
            ← Kembali
          </a>
          <a
            href="https://wa.me/628972529354"
            target="_blank"
            rel="noreferrer"
            className="hover:underline"
          >
            Ada Pertanyaan!?
          </a>
        </footer>
      </div>
    </div>
  )
}
