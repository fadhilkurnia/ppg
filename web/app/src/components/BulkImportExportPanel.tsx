import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Upload } from 'lucide-react'

import { Button } from '@/components/Button'
import {
  downloadExport,
  getBulkSchema,
  importBulk,
  type BulkEntity,
  type BulkMode,
  type BulkReport,
} from '@/api/bulk'
import { ApiError } from '@/api/client'

type Props = {
  entity: BulkEntity
  isAdmin: boolean
  invalidateKey: readonly unknown[]
  exportParams?: Record<string, string | undefined>
}

const MODE_LABEL: Record<BulkMode, string> = {
  create: 'Create (gagal jika duplikat)',
  upsert: 'Upsert (timpa jika duplikat)',
  'dry-run': 'Dry-run (validasi saja)',
}

export function BulkImportExportPanel({ entity, isAdmin, invalidateKey, exportParams }: Props) {
  const [mode, setMode] = useState<BulkMode>('create')
  const [file, setFile] = useState<File | null>(null)
  const [report, setReport] = useState<BulkReport | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const schemaQuery = useQuery({
    queryKey: ['bulk-schema', entity],
    queryFn: () => getBulkSchema(entity),
    staleTime: 5 * 60 * 1000,
  })

  const qc = useQueryClient()
  const importMutation = useMutation({
    mutationFn: () => {
      if (!file) throw new Error('Pilih file CSV terlebih dahulu.')
      return importBulk(entity, file, mode)
    },
    onSuccess: async (rep) => {
      setReport(rep)
      if (rep.summary.created + rep.summary.updated > 0) {
        await qc.invalidateQueries({ queryKey: invalidateKey })
      }
    },
  })

  const exportMutation = useMutation({
    mutationFn: () => downloadExport(entity, exportParams),
    onMutate: () => setExportError(null),
    onError: (err) => {
      setExportError(err instanceof ApiError ? err.message : (err as Error).message)
    },
  })

  const resetForm = () => {
    setFile(null)
    setReport(null)
    importMutation.reset()
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-900">Ekspor CSV</h3>
        <p className="text-sm text-slate-600">
          Unduh seluruh data {entity} sebagai CSV (mengikuti filter aktif di halaman ini).
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => exportMutation.mutate()}
            disabled={exportMutation.isPending}
          >
            <Download size={16} className="mr-1.5" />
            {exportMutation.isPending ? 'Mengunduh…' : 'Unduh CSV'}
          </Button>
          {exportError ? <span className="text-sm text-red-600">{exportError}</span> : null}
        </div>
      </section>

      {isAdmin ? (
        <section className="space-y-3 border-t border-slate-200 pt-5">
          <h3 className="text-sm font-semibold text-slate-900">Impor CSV</h3>
          <p className="text-sm text-slate-600">
            File CSV harus memuat header berikut (alias bahasa Indonesia juga didukung untuk
            beberapa kolom):
          </p>
          {schemaQuery.isPending ? (
            <p className="text-xs text-slate-500">Memuat skema…</p>
          ) : schemaQuery.data ? (
            <ul className="flex flex-wrap gap-1.5">
              {schemaQuery.data.headers.map((h) => (
                <li
                  key={h}
                  className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-700"
                >
                  {h}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-red-600">Gagal memuat skema.</p>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex-1 text-sm">
              <span className="mb-1 block text-slate-700">Berkas CSV</span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null
                  setFile(f)
                  setReport(null)
                  importMutation.reset()
                }}
                className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-slate-800"
              />
            </label>
            <label className="text-sm sm:w-56">
              <span className="mb-1 block text-slate-700">Mode</span>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as BulkMode)}
                className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
              >
                {(Object.keys(MODE_LABEL) as BulkMode[]).map((m) => (
                  <option key={m} value={m}>
                    {MODE_LABEL[m]}
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
              {importMutation.isPending ? 'Mengimpor…' : 'Impor'}
            </Button>
            {file ? (
              <Button type="button" variant="ghost" size="sm" onClick={resetForm}>
                Reset
              </Button>
            ) : null}
            {importMutation.error ? (
              <span className="text-sm text-red-600">
                {importMutation.error instanceof ApiError
                  ? importMutation.error.message
                  : (importMutation.error as Error).message}
              </span>
            ) : null}
          </div>

          {report ? <ImportReportView report={report} /> : null}
        </section>
      ) : null}
    </div>
  )
}

function ImportReportView({ report }: { report: BulkReport }) {
  const { summary, results } = report
  const failures = results.filter((r) => r.outcome === 'failed')

  return (
    <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-wrap gap-2 text-xs">
        <Tag label="Total" value={summary.total} tone="slate" />
        <Tag label="Created" value={summary.created} tone="emerald" />
        <Tag label="Updated" value={summary.updated} tone="sky" />
        <Tag label="Skipped" value={summary.skipped} tone="slate" />
        <Tag label="Failed" value={summary.failed} tone="red" />
      </div>
      {failures.length > 0 ? (
        <details className="text-sm" open={failures.length <= 5}>
          <summary className="cursor-pointer font-medium text-red-700">
            {failures.length} baris gagal
          </summary>
          <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto pl-1 text-xs text-slate-700">
            {failures.map((r) => (
              <li key={r.row}>
                <span className="font-mono">baris {r.row}:</span> {r.error ?? 'unknown error'}
              </li>
            ))}
          </ul>
        </details>
      ) : (
        <p className="text-xs text-emerald-700">Semua baris diproses tanpa kesalahan.</p>
      )}
    </div>
  )
}

const TONE: Record<'slate' | 'emerald' | 'sky' | 'red', string> = {
  slate: 'bg-slate-200 text-slate-800',
  emerald: 'bg-emerald-100 text-emerald-800',
  sky: 'bg-sky-100 text-sky-800',
  red: 'bg-red-100 text-red-800',
}

function Tag({ label, value, tone }: { label: string; value: number; tone: keyof typeof TONE }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${TONE[tone]}`}>
      <span className="font-medium">{label}</span>
      <span>{value}</span>
    </span>
  )
}
