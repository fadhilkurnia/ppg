import { apiFetch } from './client'
import type { MateriAjar } from './kurikulum'

export type PencapaianStatus = 'belum' | 'proses' | 'tuntas'

export type PencapaianLibraryKind = 'quran' | 'hadits' | 'tilawati' | 'doa'
export type PencapaianLibraryAspect = 'reciting' | 'memorizing' | 'review' | 'manqul'

export type Pencapaian = {
  id: string
  muridUserId: string
  materiAjarId?: string | null
  libraryKind?: PencapaianLibraryKind | null
  libraryAspect?: PencapaianLibraryAspect | null
  libraryRef?: string | null
  status: PencapaianStatus
  nilaiAngka?: number | null
  nilaiHuruf?: string | null
  tanggal?: string | null
  catatan?: string | null
  recordedBy?: string | null
  createdAt: string
  updatedAt: string
}

export type PencapaianRow = {
  materi: MateriAjar
  umur?: number | null
  pencapaian?: Pencapaian | null
}

export function listPencapaian(params: {
  muridUserId: string
  fromUmur?: number
  fromSem?: number
  toUmur?: number
  toSem?: number
}) {
  const sp = new URLSearchParams()
  sp.set('muridUserId', params.muridUserId)
  if (params.fromUmur != null) sp.set('fromUmur', String(params.fromUmur))
  if (params.fromSem != null) sp.set('fromSem', String(params.fromSem))
  if (params.toUmur != null) sp.set('toUmur', String(params.toUmur))
  if (params.toSem != null) sp.set('toSem', String(params.toSem))
  return apiFetch<PencapaianRow[]>(`/api/pencapaian?${sp.toString()}`)
}

export type PencapaianUpsertInput = {
  muridUserId: string
  materiAjarId?: string | null
  libraryKind?: PencapaianLibraryKind | null
  libraryAspect?: PencapaianLibraryAspect | null
  libraryRef?: string | null
  status: PencapaianStatus
  nilaiAngka?: number | null
  nilaiHuruf?: string | null
  tanggal?: string | null
  catatan?: string | null
}

export function listLibraryPencapaian(muridUserId: string) {
  const sp = new URLSearchParams({ muridUserId })
  return apiFetch<Pencapaian[]>(`/api/pencapaian/library?${sp.toString()}`)
}

export function upsertPencapaian(input: PencapaianUpsertInput) {
  return apiFetch<Pencapaian>('/api/pencapaian', { method: 'POST', body: input })
}

export function deletePencapaian(id: string) {
  return apiFetch<void>(`/api/pencapaian/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
