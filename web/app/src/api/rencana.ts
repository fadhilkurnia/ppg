import { apiFetch } from './client'
import type { MateriAjar } from './kurikulum'

export type RencanaItem = {
  id: string
  rencanaId: string
  materiAjarId?: string | null
  libraryKind?: 'quran' | 'hadits' | 'tilawati' | 'doa' | null
  libraryAspect?: 'reciting' | 'memorizing' | 'review' | 'manqul' | null
  libraryRef?: string | null
  urutan: number
  selesai: boolean
  tanggalSelesai?: string | null
  catatan?: string | null
  createdAt: string
  updatedAt: string
  ajar?: MateriAjar | null
}

export type Rencana = {
  id: string
  kelasId: string
  tahun: number
  bulan: number
  semester?: number | null
  catatan?: string | null
  createdBy?: string | null
  createdAt: string
  updatedAt: string
  items?: RencanaItem[]
}

export function listRencana(params: { kelasId?: string; tahun?: number; bulan?: number } = {}) {
  const sp = new URLSearchParams()
  if (params.kelasId) sp.set('kelasId', params.kelasId)
  if (params.tahun) sp.set('tahun', String(params.tahun))
  if (params.bulan) sp.set('bulan', String(params.bulan))
  const qs = sp.toString()
  return apiFetch<Rencana[]>(`/api/rencana-bulanan${qs ? `?${qs}` : ''}`)
}

export function getRencana(id: string) {
  return apiFetch<Rencana>(`/api/rencana-bulanan/${encodeURIComponent(id)}`)
}

export function ensureRencana(input: { kelasId: string; tahun: number; bulan: number }) {
  return apiFetch<Rencana>('/api/rencana-bulanan', { method: 'POST', body: input })
}

export function addRencanaItems(id: string, materiAjarIds: string[]) {
  return apiFetch<Rencana>(`/api/rencana-bulanan/${encodeURIComponent(id)}/items`, {
    method: 'POST',
    body: { materiAjarIds },
  })
}

export function addRencanaLibraryItem(
  id: string,
  input: {
    libraryKind: 'quran' | 'hadits' | 'tilawati' | 'doa'
    libraryAspect?: string
    libraryRef: string
  },
) {
  return apiFetch<Rencana>(
    `/api/rencana-bulanan/${encodeURIComponent(id)}/items/library`,
    { method: 'POST', body: input },
  )
}

export function toggleRencanaItem(itemId: string, selesai: boolean) {
  return apiFetch<void>(`/api/rencana-bulanan/items/${encodeURIComponent(itemId)}`, {
    method: 'PATCH',
    body: { selesai },
  })
}

export function removeRencanaItem(itemId: string) {
  return apiFetch<void>(`/api/rencana-bulanan/items/${encodeURIComponent(itemId)}`, {
    method: 'DELETE',
  })
}
