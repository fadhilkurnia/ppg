import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Upload } from 'lucide-react'

import {
  downloadExport,
  getBulkSchema,
  importBulk,
  type BulkEntity,
  type BulkMode,
  type BulkReport,
} from '@/api/bulk'
import { useTranslation } from '@/lib/i18n'
import { Button } from './Button'

type Props = {
  entity: BulkEntity
  isAdmin: boolean
  invalidateKey: readonly unknown[]
  exportParams?: Record<string, string | undefined>
}

export function BulkPanel({ entity, isAdmin, invalidateKey, exportParams }: Props) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<BulkMode>('create')
  const [file, setFile] = useState<File | null>(null)
  const [report, setReport] = useState<BulkReport | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const modeLabels: Record<BulkMode, string> = {
    create: t('bulk.modeCreate'),
    upsert: t('bulk.modeUpsert'),
    'dry-run': t('bulk.modeDryRun'),
  }

  const schemaQ = useQuery({
    queryKey: ['bulk-schema', entity],
    queryFn: () => getBulkSchema(entity),
    staleTime: 5 * 60 * 1000,
  })

  const qc = useQueryClient()
  const importMutation = useMutation({
    mutationFn: () => {
      if (!file) throw new Error(t('bulk.pickFileFirst'))
      return importBulk(entity, file, mode)
    },
    onSuccess: async (r) => {
      setReport(r)
      if (r.summary.created + r.summary.updated > 0) {
        await qc.invalidateQueries({ queryKey: invalidateKey })
      }
    },
  })

  const exportMutation = useMutation({
    mutationFn: () => downloadExport(entity, exportParams),
    onMutate: () => setExportError(null),
    onError: (err) => setExportError(err.message),
  })

  const reset = () => {
    setFile(null)
    setReport(null)
    importMutation.reset()
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('bulk.exportTitle')}</h3>
        <p className="text-sm text-slate-600 dark:text-slate-400">{t('bulk.exportHint', { entity })}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => exportMutation.mutate()}
            disabled={exportMutation.isPending}
          >
            <Download size={16} className="mr-1.5" />
            {exportMutation.isPending ? t('bulk.downloading') : t('bulk.download')}
          </Button>
          {exportError ? <span className="text-sm text-red-600">{exportError}</span> : null}
        </div>
      </section>

      {isAdmin ? (
        <section className="space-y-3 border-t border-slate-200 dark:border-slate-800 pt-5">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('bulk.importTitle')}</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400">{t('bulk.importHint')}</p>
          {schemaQ.isPending ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">{t('bulk.loadingSchema')}</p>
          ) : schemaQ.data ? (
            <ul className="flex flex-wrap gap-1.5">
              {schemaQ.data.headers.map((h) => (
                <li
                  key={h}
                  className="rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 font-mono text-xs text-slate-700 dark:text-slate-300"
                >
                  {h}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-red-600 dark:text-red-400">{t('bulk.schemaError')}</p>
          )}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex-1 text-sm">
              <span className="mb-1 block text-slate-700 dark:text-slate-300">{t('bulk.fileLabel')}</span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null)
                  setReport(null)
                  importMutation.reset()
                }}
                className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-slate-800"
              />
            </label>
            <label className="text-sm sm:w-56">
              <span className="mb-1 block text-slate-700 dark:text-slate-300">{t('bulk.modeLabel')}</span>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as BulkMode)}
                className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-base sm:text-sm text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
              >
                {(Object.keys(modeLabels) as BulkMode[]).map((m) => (
                  <option key={m} value={m}>
                    {modeLabels[m]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={() => importMutation.mutate()}
              disabled={!file || importMutation.isPending}
            >
              <Upload size={16} className="mr-1.5" />
              {importMutation.isPending ? t('bulk.importing') : t('bulk.importBtn')}
            </Button>
            {file ? (
              <Button type="button" variant="ghost" size="sm" onClick={reset}>
                {t('bulk.reset')}
              </Button>
            ) : null}
            {importMutation.error ? (
              <span className="text-sm text-red-600">{importMutation.error.message}</span>
            ) : null}
          </div>
          {report ? <ReportView report={report} /> : null}
        </section>
      ) : null}
    </div>
  )
}

export function ReportView({ report }: { report: BulkReport }) {
  const { t } = useTranslation()
  const { summary, results } = report
  const failed = results.filter((r) => r.outcome === 'failed')

  return (
    <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50 p-3">
      <div className="flex flex-wrap gap-2 text-xs">
        <SummaryBadge label="Total" value={summary.total} tone="slate" />
        <SummaryBadge label="Created" value={summary.created} tone="emerald" />
        <SummaryBadge label="Updated" value={summary.updated} tone="sky" />
        <SummaryBadge label="Skipped" value={summary.skipped} tone="slate" />
        <SummaryBadge label="Failed" value={summary.failed} tone="red" />
      </div>
      {failed.length > 0 ? (
        <details className="text-sm" open={failed.length <= 5}>
          <summary className="cursor-pointer font-medium text-red-700 dark:text-red-400">
            {t('bulk.rowsFailed', { n: failed.length })}
          </summary>
          <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto pl-1 text-xs text-slate-700 dark:text-slate-300">
            {failed.map((r) => (
              <li key={r.row}>
                <span className="font-mono">{t('bulk.rowPrefix', { n: r.row })}</span>{' '}
                {r.error ?? t('bulk.unknownError')}
              </li>
            ))}
          </ul>
        </details>
      ) : (
        <p className="text-xs text-emerald-700 dark:text-emerald-400">{t('bulk.rowsOk')}</p>
      )}
    </div>
  )
}

const BADGE_TONES = {
  slate: 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200',
  emerald: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  sky: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  red: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
} as const

function SummaryBadge({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: keyof typeof BADGE_TONES
}) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${BADGE_TONES[tone]}`}>
      <span className="font-medium">{label}</span>
      <span>{value}</span>
    </span>
  )
}
