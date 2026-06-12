import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Upload, X } from 'lucide-react'

import { getSettings, updateSettings } from '@/api/settings'
import { ApiError } from '@/api/client'
import { Button } from '@/components/Button'
import { Field } from '@/components/Field'
import { Input } from '@/components/Input'
import { PageShell } from '@/components/PageShell'
import { useToast } from '@/lib/toast'

/**
 * InstansiSection — admin setting for branding. Two fields:
 *   - Nama instansi (text, shown next to "GNRS" in the header)
 *   - Logo instansi (image upload, converted to a data URL and stored in
 *     the same settings table for simplicity)
 */
export function InstansiSection() {
  const { t } = useTranslation()
  const toast = useToast()
  const qc = useQueryClient()
  const { data: settings = {} } = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
    staleTime: 30_000,
  })

  const [nama, setNama] = useState('')
  const [logoData, setLogoData] = useState<string>('')
  const fileRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setNama(settings.instansi_name ?? '')
    setLogoData(settings.instansi_logo ?? '')
  }, [settings.instansi_name, settings.instansi_logo])

  const mut = useMutation({
    mutationFn: (updates: Record<string, string>) => updateSettings(updates),
    onSuccess: () => {
      toast(t('instansi.saved'), 'success')
      qc.invalidateQueries({ queryKey: ['settings'] })
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : t('instansi.saveFailed'), 'error'),
  })

  const handlePickFile = (file: File) => {
    if (file.size > 1024 * 1024) {
      toast(t('instansi.logoMaxToast'), 'error')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result ?? '')
      setLogoData(dataUrl)
    }
    reader.readAsDataURL(file)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    mut.mutate({
      instansi_name: nama.trim(),
      instansi_logo: logoData,
    })
  }

  return (
    <PageShell>
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">{t('instansi.title')}</h2>
          <p className="text-sm text-slate-500">
            {t('instansi.subtitle')}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="max-w-xl space-y-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <Field label={t('instansi.logoLabel')} htmlFor="instansi-logo" hint={t('instansi.logoHint')}>
            <div className="flex items-center gap-3">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                {logoData ? (
                  <img src={logoData} alt="" className="h-full w-full object-contain" />
                ) : (
                  <span className="text-[10px] text-slate-400">{t('instansi.noLogo')}</span>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <input
                  id="instansi-logo"
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) handlePickFile(f)
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload size={14} className="mr-1" /> {t('instansi.uploadBtn')}
                </Button>
                {logoData ? (
                  <button
                    type="button"
                    onClick={() => setLogoData('')}
                    className="inline-flex items-center gap-1 text-xs text-rose-600 hover:underline"
                  >
                    <X size={12} /> {t('instansi.removeBtn')}
                  </button>
                ) : null}
              </div>
            </div>
          </Field>
          <Field
            label={t('instansi.namaLabel')}
            htmlFor="instansi-nama"
            hint={t('instansi.namaHint')}
          >
            <Input
              id="instansi-nama"
              value={nama}
              onChange={(e) => setNama(e.target.value)}
              placeholder={t('instansi.namaPh')}
              maxLength={100}
            />
          </Field>
          <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">{t('instansi.previewLabel')}</div>
            <div className="mt-1 flex items-center gap-2 text-base font-semibold text-slate-900">
              {logoData ? (
                <img src={logoData} alt="" className="h-6 w-6 object-contain" />
              ) : null}
              <span>GNRS{nama ? ` ${nama}` : ''}</span>
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={mut.isPending}>
              {mut.isPending ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </form>
      </div>
    </PageShell>
  )
}
