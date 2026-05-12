import { apiDownload, apiFetch } from './client'

export type BulkEntity = 'students' | 'teachers' | 'attendances' | 'users'

export type BulkMode = 'create' | 'upsert' | 'dry-run'

export type BulkOutcome = 'created' | 'updated' | 'skipped' | 'failed'

export type BulkRowResult = {
  row: number
  outcome: BulkOutcome
  id?: string
  error?: string
}

export type BulkSummary = {
  total: number
  created: number
  updated: number
  skipped: number
  failed: number
}

export type BulkReport = {
  summary: BulkSummary
  results: BulkRowResult[]
}

export type BulkSchema = {
  entity: string
  headers: string[]
}

export function getBulkSchema(entity: BulkEntity): Promise<BulkSchema> {
  return apiFetch<BulkSchema>(`/api/${entity}/bulk/schema`)
}

export function importBulk(
  entity: BulkEntity,
  file: File,
  mode: BulkMode,
): Promise<BulkReport> {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('mode', mode)
  return apiFetch<BulkReport>(`/api/${entity}/bulk`, { method: 'POST', body: fd })
}

// downloadExport streams /api/{entity}/export.csv and saves it via a
// transient anchor click. Cookies + dynamic prefix are handled by
// apiDownload, so this works under DYNAMIC_API_PATH too.
export async function downloadExport(
  entity: BulkEntity,
  params: Record<string, string | undefined> = {},
): Promise<void> {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v) qs.set(k, v)
  }
  const suffix = qs.toString()
  const path = `/api/${entity}/export.csv${suffix ? `?${suffix}` : ''}`
  const res = await apiDownload(path)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${entity}-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
