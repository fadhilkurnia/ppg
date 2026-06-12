import { apiFetch } from './client'

export type HaditsKitab = {
  id: string
  slug: string
  nama: string
  namaArab?: string | null
  deskripsi?: string | null
  perawi?: string | null
  urutan: number
  scope: 'hadits' | 'maktabah' | 'both'
  jumlahHalaman: number
  babCount: number
  haditsCount: number
}

export type HaditsBab = {
  id: string
  kitabId: string
  nomor: number
  nama: string
  deskripsi?: string | null
}

export type Hadits = {
  id: string
  kitabId: string
  babId?: string | null
  nomor: number
  teksArab?: string | null
  teksLatin?: string | null
  terjemahan?: string | null
  terjemahanEn?: string | null
  perawi?: string | null
  derajat?: string | null
  sumberAsli?: string | null
}

export type HaditsListResponse = {
  items: Hadits[]
  total: number
  limit: number
  offset: number
}

export function listKitab(scope?: 'hadits' | 'maktabah' | '') {
  const qs = scope ? `?scope=${encodeURIComponent(scope)}` : ''
  return apiFetch<HaditsKitab[]>(`/api/hadits/kitab${qs}`)
}

export function getKitab(slug: string) {
  return apiFetch<HaditsKitab>(`/api/hadits/kitab/${encodeURIComponent(slug)}`)
}

export function updateKitabJumlahHalaman(slug: string, jumlahHalaman: number) {
  return apiFetch<HaditsKitab>(`/api/hadits/kitab/${encodeURIComponent(slug)}`, {
    method: 'PATCH',
    body: { jumlahHalaman },
  })
}

export type KitabInput = {
  slug: string
  nama: string
  namaArab?: string | null
  deskripsi?: string | null
  perawi?: string | null
  urutan: number
  scope: 'hadits' | 'maktabah' | 'both'
  jumlahHalaman: number
}

export function createKitab(input: KitabInput) {
  return apiFetch<HaditsKitab>(`/api/hadits/kitab`, { method: 'POST', body: input })
}

export function updateKitab(slug: string, input: KitabInput) {
  return apiFetch<HaditsKitab>(`/api/hadits/kitab/${encodeURIComponent(slug)}`, {
    method: 'PATCH',
    body: input,
  })
}

export function deleteKitab(slug: string) {
  return apiFetch<void>(`/api/hadits/kitab/${encodeURIComponent(slug)}`, { method: 'DELETE' })
}

export function listBab(slug: string) {
  return apiFetch<HaditsBab[]>(`/api/hadits/kitab/${encodeURIComponent(slug)}/bab`)
}

export function listHadits(
  slug: string,
  params: { babId?: string; q?: string; limit?: number; offset?: number } = {},
) {
  const sp = new URLSearchParams()
  if (params.babId) sp.set('babId', params.babId)
  if (params.q) sp.set('q', params.q)
  if (params.limit) sp.set('limit', String(params.limit))
  if (params.offset) sp.set('offset', String(params.offset))
  const qs = sp.toString()
  return apiFetch<HaditsListResponse>(
    `/api/hadits/kitab/${encodeURIComponent(slug)}/hadits${qs ? `?${qs}` : ''}`,
  )
}
