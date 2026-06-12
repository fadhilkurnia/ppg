import { apiFetch } from './client'

export type KarakterItem = {
  id: string
  parent: string
  parentEn?: string | null
  parentUrutan: number
  labelId: string
  labelEn?: string | null
  itemUrutan: number
  catatan?: string | null
  createdAt: string
  updatedAt: string
}

export type KarakterInput = {
  parent: string
  parentEn?: string | null
  parentUrutan: number
  labelId: string
  labelEn?: string | null
  itemUrutan: number
  catatan?: string | null
}

export function listKarakter() {
  return apiFetch<KarakterItem[]>('/api/karakter-luhur')
}

export function createKarakter(input: KarakterInput) {
  return apiFetch<KarakterItem>('/api/karakter-luhur', { method: 'POST', body: input })
}

export function updateKarakter(id: string, input: KarakterInput) {
  return apiFetch<KarakterItem>(`/api/karakter-luhur/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: input,
  })
}

export function deleteKarakter(id: string) {
  return apiFetch<void>(`/api/karakter-luhur/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export type GroupRenameInput = {
  parent: string
  parentEn?: string | null
  parentUrutan?: number | null
}

export function renameKarakterGroup(oldParent: string, input: GroupRenameInput) {
  return apiFetch<{ updated: number }>(
    `/api/karakter-luhur/groups/${encodeURIComponent(oldParent)}`,
    { method: 'PATCH', body: input },
  )
}

export function deleteKarakterGroup(parent: string) {
  return apiFetch<{ deleted: number }>(
    `/api/karakter-luhur/groups/${encodeURIComponent(parent)}`,
    { method: 'DELETE' },
  )
}
