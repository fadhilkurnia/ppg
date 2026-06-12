import { apiFetch } from './client'

export type TahunAjaran = {
  id: string
  nama: string
  active: boolean
  semester1StartMonth: number
  semester2StartMonth: number
  tanggalMulai?: string | null
  tanggalSelesai?: string | null
  createdAt: string
  updatedAt: string
}

export type TahunAjaranInput = {
  nama: string
  semester1StartMonth?: number
  semester2StartMonth?: number
  tanggalMulai?: string | null
  tanggalSelesai?: string | null
}

export function listTahunAjaran() {
  return apiFetch<TahunAjaran[]>('/api/tahun-ajaran')
}

export function getActiveTahunAjaran() {
  return apiFetch<TahunAjaran | null>('/api/tahun-ajaran/active')
}

export function createTahunAjaran(input: TahunAjaranInput) {
  return apiFetch<TahunAjaran>('/api/tahun-ajaran', { method: 'POST', body: input })
}

export function updateTahunAjaran(id: string, input: TahunAjaranInput) {
  return apiFetch<TahunAjaran>(`/api/tahun-ajaran/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: input,
  })
}

export function deleteTahunAjaran(id: string) {
  return apiFetch<void>(`/api/tahun-ajaran/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function activateTahunAjaran(id: string) {
  return apiFetch<TahunAjaran>(`/api/tahun-ajaran/${encodeURIComponent(id)}/activate`, {
    method: 'POST',
  })
}
