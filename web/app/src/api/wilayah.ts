import { apiFetch } from './client'

export type WilayahKelompok = { id: string; name: string }
export type WilayahDesa = { id: string; name: string; kelompok: WilayahKelompok[] }
export type WilayahDaerah = { id: string; name: string; desa: WilayahDesa[] }
export type WilayahTree = { daerah: WilayahDaerah[] }

// All mutations return the full refreshed tree so callers can replace state.
export function getWilayah() {
  return apiFetch<WilayahTree>('/api/wilayah')
}

export function createDaerah(name: string) {
  return apiFetch<WilayahTree>('/api/wilayah/daerah', { method: 'POST', body: { name } })
}
export function renameDaerah(id: string, name: string) {
  return apiFetch<WilayahTree>(`/api/wilayah/daerah/${encodeURIComponent(id)}`, { method: 'PATCH', body: { name } })
}
export function deleteDaerah(id: string) {
  return apiFetch<WilayahTree>(`/api/wilayah/daerah/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function createDesa(daerahId: string, name: string) {
  return apiFetch<WilayahTree>(`/api/wilayah/daerah/${encodeURIComponent(daerahId)}/desa`, {
    method: 'POST',
    body: { name },
  })
}
export function renameDesa(id: string, name: string) {
  return apiFetch<WilayahTree>(`/api/wilayah/desa/${encodeURIComponent(id)}`, { method: 'PATCH', body: { name } })
}
export function deleteDesa(id: string) {
  return apiFetch<WilayahTree>(`/api/wilayah/desa/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function createKelompok(desaId: string, name: string) {
  return apiFetch<WilayahTree>(`/api/wilayah/desa/${encodeURIComponent(desaId)}/kelompok`, {
    method: 'POST',
    body: { name },
  })
}
export function renameKelompok(id: string, name: string) {
  return apiFetch<WilayahTree>(`/api/wilayah/kelompok/${encodeURIComponent(id)}`, { method: 'PATCH', body: { name } })
}
export function deleteKelompok(id: string) {
  return apiFetch<WilayahTree>(`/api/wilayah/kelompok/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
