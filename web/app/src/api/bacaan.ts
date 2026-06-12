import { apiFetch } from './client'

export type BacaanSource = 'pengajian' | 'mandiri'

export type BacaanLog = {
  id: string
  userId: string
  recordedBy?: string | null
  source: BacaanSource
  tanggal: string
  surah: number
  ayatFrom: number
  ayatTo: number
  catatan?: string | null
  sesiId?: string | null
  createdAt: string
  updatedAt: string
  userName?: string | null
  recorderName?: string | null
}

export type BacaanInput = {
  userId: string
  source?: BacaanSource
  tanggal: string
  surah: number
  ayatFrom: number
  ayatTo: number
  catatan?: string | null
  sesiId?: string | null
}

export type BacaanSummary = {
  userId: string
  userName: string
  userNickname?: string | null
  userRole: string
  photoPath?: string | null
  totalAyat: number
  lastRead?: string | null
  sessions: number
  lastSurah?: number | null
  lastAyatFrom?: number | null
  lastAyatTo?: number | null
}

export type SurahProgress = {
  surah: number
  ayatRead: number
  sessions: number
}

export type BacaanSummaryResponse = {
  totalQuranAyat: number
  items: BacaanSummary[]
}

export function listBacaan(params: {
  userId?: string
  from?: string
  to?: string
  source?: BacaanSource | ''
  limit?: number
} = {}) {
  const sp = new URLSearchParams()
  if (params.userId) sp.set('userId', params.userId)
  if (params.from) sp.set('from', params.from)
  if (params.to) sp.set('to', params.to)
  if (params.source) sp.set('source', params.source)
  if (params.limit) sp.set('limit', String(params.limit))
  const qs = sp.toString()
  return apiFetch<BacaanLog[]>(`/api/bacaan${qs ? `?${qs}` : ''}`)
}

export function getBacaanSummary() {
  return apiFetch<BacaanSummaryResponse>('/api/bacaan/summary')
}

export function getBacaanPerSurah(userId: string) {
  return apiFetch<SurahProgress[]>(
    `/api/bacaan/per-surah?userId=${encodeURIComponent(userId)}`,
  )
}

export function createBacaan(input: BacaanInput) {
  return apiFetch<BacaanLog>('/api/bacaan', { method: 'POST', body: input })
}

export function deleteBacaan(id: string) {
  return apiFetch<void>(`/api/bacaan/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
