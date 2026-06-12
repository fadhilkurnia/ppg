import { apiFetch } from './client'

export type LibraryKind = 'kurikulum' | 'quran' | 'hadits' | 'tilawati' | 'doa'
export type LibraryAspect = 'reciting' | 'memorizing' | 'review' | 'manqul'

export type SesiLibraryItem = {
  id?: string
  libraryKind: Exclude<LibraryKind, 'kurikulum'>
  libraryAspect?: LibraryAspect | null
  libraryRef: string
}

export type Sesi = {
  id: string
  tanggal: string
  mulai?: string | null
  selesai?: string | null
  topik: string
  catatan?: string | null
  tingkat?: string | null
  materiAjarId?: string | null
  materiAjarIds: string[]
  guruId?: string | null
  kelasId?: string | null
  libraryKind?: LibraryKind | null
  libraryAspect?: LibraryAspect | null
  libraryRef?: string | null
  libraryItems: SesiLibraryItem[]
  startedAt?: string | null
  endedAt?: string | null
  liveMateriId?: string | null
  liveDisplayMode?: 'full' | 'title' | 'hidden' | null
  createdBy?: string | null
  jadwalId?: string | null
  createdAt: string
  updatedAt: string
}

export type SesiInput = {
  tanggal: string
  mulai?: string | null
  selesai?: string | null
  topik: string
  catatan?: string | null
  tingkat?: string | null
  materiAjarId?: string | null
  materiAjarIds?: string[]
  guruId?: string | null
  kelasId?: string | null
  libraryKind?: LibraryKind | null
  libraryAspect?: LibraryAspect | null
  libraryRef?: string | null
  libraryItems?: SesiLibraryItem[]
}

export type SesiListParams = {
  from?: string
  to?: string
  tingkat?: string
  guruId?: string
  kelasId?: string
}

export function listSesi(params: SesiListParams = {}) {
  const sp = new URLSearchParams()
  if (params.from) sp.set('from', params.from)
  if (params.to) sp.set('to', params.to)
  if (params.tingkat) sp.set('tingkat', params.tingkat)
  if (params.guruId) sp.set('guruId', params.guruId)
  if (params.kelasId) sp.set('kelasId', params.kelasId)
  const qs = sp.toString()
  return apiFetch<Sesi[]>(`/api/sesi${qs ? `?${qs}` : ''}`)
}

export function getSesi(id: string) {
  return apiFetch<Sesi>(`/api/sesi/${encodeURIComponent(id)}`)
}

export function createSesi(input: SesiInput) {
  return apiFetch<Sesi>('/api/sesi', { method: 'POST', body: input })
}

export function updateSesi(id: string, input: SesiInput) {
  return apiFetch<Sesi>(`/api/sesi/${encodeURIComponent(id)}`, { method: 'PATCH', body: input })
}

export function deleteSesi(id: string) {
  return apiFetch<void>(`/api/sesi/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function startSesi(id: string) {
  return apiFetch<Sesi>(`/api/sesi/${encodeURIComponent(id)}/start`, { method: 'POST' })
}

export function endSesi(id: string) {
  return apiFetch<Sesi>(`/api/sesi/${encodeURIComponent(id)}/end`, { method: 'POST' })
}

export type SesiLiveInput = {
  liveMateriId?: string | null
  liveDisplayMode?: 'full' | 'title' | 'hidden' | null
}

export function setSesiLive(id: string, input: SesiLiveInput) {
  return apiFetch<Sesi>(`/api/sesi/${encodeURIComponent(id)}/live`, {
    method: 'PATCH',
    body: input,
  })
}
