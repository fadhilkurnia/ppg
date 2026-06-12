import type { LibraryAspect } from './sesi'
import { apiFetch } from './client'

export type DiajarkanKind = 'kurikulum' | 'quran' | 'hadits' | 'tilawati' | 'doa'

export type MateriDiajarkan = {
  id: string
  sesiId: string
  kind: DiajarkanKind
  materiAjarId?: string | null
  ref?: string | null
  label?: string | null
  libraryAspect?: LibraryAspect | null
  needsParentReview: boolean
  parentNote?: string | null
  completed: boolean
  completedAt?: string | null
  taughtAt: string
  createdAt: string
  updatedAt: string
}

export type MateriDiajarkanInput = {
  kind: DiajarkanKind
  materiAjarId?: string | null
  ref?: string | null
  label?: string | null
  libraryAspect?: LibraryAspect | null
}

export type MateriDiajarkanUpdate = {
  needsParentReview?: boolean
  parentNote?: string | null
  completed?: boolean
}

export function listDiajarkan(sesiId: string) {
  return apiFetch<MateriDiajarkan[]>(
    `/api/sesi/${encodeURIComponent(sesiId)}/diajarkan`,
  )
}

export function addDiajarkan(sesiId: string, input: MateriDiajarkanInput) {
  return apiFetch<MateriDiajarkan>(
    `/api/sesi/${encodeURIComponent(sesiId)}/diajarkan`,
    { method: 'POST', body: input },
  )
}

export function updateDiajarkan(
  sesiId: string,
  itemId: string,
  input: MateriDiajarkanUpdate,
) {
  return apiFetch<MateriDiajarkan>(
    `/api/sesi/${encodeURIComponent(sesiId)}/diajarkan/${encodeURIComponent(itemId)}`,
    { method: 'PATCH', body: input },
  )
}

export function deleteDiajarkan(sesiId: string, itemId: string) {
  return apiFetch<void>(
    `/api/sesi/${encodeURIComponent(sesiId)}/diajarkan/${encodeURIComponent(itemId)}`,
    { method: 'DELETE' },
  )
}
