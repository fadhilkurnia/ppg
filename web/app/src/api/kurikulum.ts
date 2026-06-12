import { apiFetch } from './client'

export type Tingkat = {
  id: string
  nama: string
  urutan: number
  umur?: number | null
}

export type TingkatInput = {
  nama: string
  urutan: number
  umur?: number | null
}

export type MateriKategori = 'baru' | 'lanjutan' | 'mengulang'

export type MateriAjar = {
  id: string
  kodeMateri: string
  refRaportId?: string
  tingkat: string
  tema: string
  subTema: string
  kelompokMateri?: string
  detailMateri: string
  semester: number
  kategori: MateriKategori
  refSourceTingkat?: string
  refSourceKode?: string
  perluReviewOrtu: boolean
  progresif: boolean
  libraryRelation?: string
}

export type MateriAjarInput = {
  kodeMateri: string
  refRaportId?: string
  tingkat: string
  tema: string
  subTema: string
  kelompokMateri?: string
  detailMateri: string
  semester: number
  kategori: MateriKategori
  refSourceTingkat?: string
  refSourceKode?: string
  perluReviewOrtu: boolean
  progresif: boolean
  libraryRelation?: string
}

export function listTingkat() {
  return apiFetch<Tingkat[]>('/api/tingkat')
}

export function getTingkat(id: string) {
  return apiFetch<Tingkat>(`/api/tingkat/${encodeURIComponent(id)}`)
}

export function createTingkat(input: TingkatInput) {
  return apiFetch<Tingkat>('/api/tingkat', { method: 'POST', body: input })
}

export function updateTingkat(id: string, input: TingkatInput) {
  return apiFetch<Tingkat>(`/api/tingkat/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: input,
  })
}

export function deleteTingkat(id: string) {
  return apiFetch<void>(`/api/tingkat/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function listMateriAjar(params: {
  tingkat?: string
  tema?: string
  semester?: number
  q?: string
} = {}) {
  const sp = new URLSearchParams()
  if (params.tingkat) sp.set('tingkat', params.tingkat)
  if (params.tema) sp.set('tema', params.tema)
  if (params.semester) sp.set('semester', String(params.semester))
  if (params.q) sp.set('q', params.q)
  const qs = sp.toString()
  return apiFetch<MateriAjar[]>(`/api/materi/ajar${qs ? `?${qs}` : ''}`)
}

export function getMateriAjar(id: string) {
  return apiFetch<MateriAjar>(`/api/materi/ajar/${encodeURIComponent(id)}`)
}

export function createMateriAjar(input: MateriAjarInput) {
  return apiFetch<MateriAjar>('/api/materi/ajar', { method: 'POST', body: input })
}

export function updateMateriAjar(id: string, input: MateriAjarInput) {
  return apiFetch<MateriAjar>(`/api/materi/ajar/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: input,
  })
}

export function deleteMateriAjar(id: string) {
  return apiFetch<void>(`/api/materi/ajar/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function deleteMateriByTema(tema: string) {
  return apiFetch<{ deleted: number }>(
    `/api/materi/ajar/by-tema/${encodeURIComponent(tema)}`,
    { method: 'DELETE' },
  )
}

export function deleteMateriBySubTema(tema: string, subTema: string) {
  return apiFetch<{ deleted: number }>(
    `/api/materi/ajar/by-tema/${encodeURIComponent(tema)}/sub/${encodeURIComponent(subTema)}`,
    { method: 'DELETE' },
  )
}

// ---- Library refs + relations ---------------------------------------------

export type MateriLibraryRef = {
  id: string
  materiAjarId: string
  libraryKind: 'quran' | 'hadits' | 'tilawati' | 'doa'
  libraryAspect?: 'reciting' | 'memorizing' | 'review' | 'manqul' | null
  libraryRef: string
  createdAt: string
}

export function listMateriLibraryRefs(materiId: string) {
  return apiFetch<MateriLibraryRef[]>(
    `/api/materi/ajar/${encodeURIComponent(materiId)}/library-refs`,
  )
}

export function addMateriLibraryRef(
  materiId: string,
  input: {
    libraryKind: 'quran' | 'hadits' | 'tilawati' | 'doa'
    libraryAspect?: string | null
    libraryRef: string
  },
) {
  return apiFetch<MateriLibraryRef>(
    `/api/materi/ajar/${encodeURIComponent(materiId)}/library-refs`,
    { method: 'POST', body: input },
  )
}

export function deleteMateriLibraryRef(materiId: string, refId: string) {
  return apiFetch<void>(
    `/api/materi/ajar/${encodeURIComponent(materiId)}/library-refs/${encodeURIComponent(refId)}`,
    { method: 'DELETE' },
  )
}

export function listMateriRelations(materiId: string) {
  return apiFetch<string[]>(`/api/materi/ajar/${encodeURIComponent(materiId)}/relations`)
}

export function addMateriRelation(materiId: string, otherMateriId: string) {
  return apiFetch<void>(`/api/materi/ajar/${encodeURIComponent(materiId)}/relations`, {
    method: 'POST',
    body: { otherMateriId },
  })
}

export function deleteMateriRelation(materiId: string, otherMateriId: string) {
  return apiFetch<void>(
    `/api/materi/ajar/${encodeURIComponent(materiId)}/relations/${encodeURIComponent(otherMateriId)}`,
    { method: 'DELETE' },
  )
}
