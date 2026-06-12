import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { getSettings, updateSettings } from '@/api/settings'
import { ApiError } from '@/api/client'
import { Button } from '@/components/Button'
import { PageShell } from '@/components/PageShell'
import { useToast } from '@/lib/toast'
import { DEFAULT_WA_TEMPLATE } from '@/components/EndSesiSummaryDialog'

export function WhatsappSection() {
  const { t } = useTranslation()
  const toast = useToast()
  const qc = useQueryClient()
  const { data: settings = {} } = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
    staleTime: 30_000,
  })
  const [tpl, setTpl] = useState('')

  useEffect(() => {
    setTpl(settings.wa_summary_template ?? '')
  }, [settings.wa_summary_template])

  const mut = useMutation({
    mutationFn: (updates: Record<string, string>) => updateSettings(updates),
    onSuccess: () => {
      toast(t('whatsapp.savedToast'), 'success')
      qc.invalidateQueries({ queryKey: ['settings'] })
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : t('whatsapp.saveFailed'), 'error'),
  })

  const PLACEHOLDERS: { key: string; desc: string }[] = [
    { key: '{salutation}', desc: t('whatsapp.ph.salutation') },
    { key: '{parent_name}', desc: t('whatsapp.ph.parentName') },
    { key: '{murid_name}', desc: t('whatsapp.ph.muridName') },
    { key: '{topik}', desc: t('whatsapp.ph.topik') },
    { key: '{tanggal}', desc: t('whatsapp.ph.tanggal') },
    { key: '{durasi}', desc: t('whatsapp.ph.durasi') },
    { key: '{materi_list}', desc: t('whatsapp.ph.materiList') },
    { key: '{review_section}', desc: t('whatsapp.ph.reviewSection') },
  ]

  return (
    <PageShell>
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">{t('whatsapp.title')}</h2>
          <p className="text-sm text-slate-500">
            {t('whatsapp.subtitle')}
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              mut.mutate({ wa_summary_template: tpl })
            }}
            className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2"
          >
            <textarea
              value={tpl}
              onChange={(e) => setTpl(e.target.value)}
              rows={16}
              placeholder={DEFAULT_WA_TEMPLATE}
              className="block w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm shadow-sm focus:border-emerald-500 focus:outline-none"
            />
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setTpl(DEFAULT_WA_TEMPLATE)}
              >
                {t('whatsapp.usePreset')}
              </Button>
              <Button type="submit" disabled={mut.isPending}>
                {mut.isPending ? t('common.saving') : t('common.save')}
              </Button>
            </div>
          </form>

          <aside className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              {t('whatsapp.placeholderHeader')}
            </div>
            <ul className="space-y-2">
              {PLACEHOLDERS.map((p) => (
                <li key={p.key} className="text-xs">
                  <code className="rounded bg-white px-1.5 py-0.5 font-mono text-emerald-700">
                    {p.key}
                  </code>
                  <span className="ml-2 text-slate-600">{p.desc}</span>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </div>
    </PageShell>
  )
}
