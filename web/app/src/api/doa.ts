import { apiFetch } from './client'

export type Doa = {
  id: string
  nama: string
  deskripsi?: string | null
  aktif: boolean
  teksArab?: string | null
  teksLatin?: string | null
  terjemahan?: string | null
  sumber?: string | null
  quranSurah?: number | null
  quranAyat?: string | null
}

export function listDoa(params: { q?: string } = {}) {
  const sp = new URLSearchParams()
  if (params.q) sp.set('q', params.q)
  const qs = sp.toString()
  return apiFetch<Doa[]>(`/api/compact-ajar${qs ? `?${qs}` : ''}`)
}

export function getDoa(id: string) {
  return apiFetch<Doa>(`/api/compact-ajar/${encodeURIComponent(id)}`)
}

export type DoaInput = {
  nama: string
  deskripsi?: string | null
  aktif?: boolean
  teksArab?: string | null
  teksLatin?: string | null
  terjemahan?: string | null
  sumber?: string | null
  quranSurah?: number | null
  quranAyat?: string | null
}

export function createDoa(input: DoaInput) {
  return apiFetch<Doa>('/api/compact-ajar', { method: 'POST', body: input })
}

export function updateDoa(id: string, input: DoaInput) {
  return apiFetch<Doa>(`/api/compact-ajar/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: input,
  })
}

export function deleteDoa(id: string) {
  return apiFetch<void>(`/api/compact-ajar/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
