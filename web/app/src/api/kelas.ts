import { apiFetch } from './client'

export type Kelas = {
  id: string
  nama: string
  tingkat: string
  guruUserId?: string | null
  guruName?: string | null
  /** Full list of guru ids assigned (primary + secondary). Always present
   *  in API responses, may be empty when no guru is assigned. */
  guruUserIds: string[]
  tahun: number
  deskripsi?: string | null
  createdAt: string
  updatedAt: string
}

export type KelasInput = {
  nama: string
  tingkat: string
  guruUserId?: string | null
  guruUserIds?: string[]
  tahun?: number
  deskripsi?: string | null
}

export type KelasAnggota = {
  kelasId: string
  muridUserId: string
  muridName: string
  createdAt: string
}

export type KelasGuruAnggota = {
  kelasId: string
  guruUserId: string
  guruName: string
  isPrimary: boolean
  createdAt: string
}

export function listKelas(params: { tingkat?: string; tahun?: number; guruId?: string } = {}) {
  const sp = new URLSearchParams()
  if (params.tingkat) sp.set('tingkat', params.tingkat)
  if (params.tahun) sp.set('tahun', String(params.tahun))
  if (params.guruId) sp.set('guruId', params.guruId)
  const qs = sp.toString()
  return apiFetch<Kelas[]>(`/api/kelas${qs ? `?${qs}` : ''}`)
}

export function getKelas(id: string) {
  return apiFetch<Kelas>(`/api/kelas/${encodeURIComponent(id)}`)
}

export function createKelas(input: KelasInput) {
  return apiFetch<Kelas>('/api/kelas', { method: 'POST', body: input })
}

export function updateKelas(id: string, input: KelasInput) {
  return apiFetch<Kelas>(`/api/kelas/${encodeURIComponent(id)}`, { method: 'PATCH', body: input })
}

export function deleteKelas(id: string) {
  return apiFetch<void>(`/api/kelas/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function listAnggota(kelasId: string) {
  return apiFetch<KelasAnggota[]>(`/api/kelas/${encodeURIComponent(kelasId)}/anggota`)
}

export function addAnggota(kelasId: string, muridIds: string[]) {
  return apiFetch<KelasAnggota[]>(`/api/kelas/${encodeURIComponent(kelasId)}/anggota`, {
    method: 'POST',
    body: { muridIds },
  })
}

export function removeAnggota(kelasId: string, muridId: string) {
  return apiFetch<void>(
    `/api/kelas/${encodeURIComponent(kelasId)}/anggota/${encodeURIComponent(muridId)}`,
    { method: 'DELETE' },
  )
}

export function listGuruAnggota(kelasId: string) {
  return apiFetch<KelasGuruAnggota[]>(`/api/kelas/${encodeURIComponent(kelasId)}/guru`)
}

export function addGuruAnggota(kelasId: string, guruIds: string[]) {
  return apiFetch<KelasGuruAnggota[]>(`/api/kelas/${encodeURIComponent(kelasId)}/guru`, {
    method: 'POST',
    body: { guruIds },
  })
}

export function removeGuruAnggota(kelasId: string, guruId: string) {
  return apiFetch<void>(
    `/api/kelas/${encodeURIComponent(kelasId)}/guru/${encodeURIComponent(guruId)}`,
    { method: 'DELETE' },
  )
}

// --- Jadwal rutin (recurring weekly schedule) ---

export type KelasJadwal = {
  id: string
  kelasId: string
  /** Weekday ints, 0=Minggu..6=Sabtu. */
  hari: number[]
  mulai: string
  selesai?: string | null
  topikDefault?: string | null
  mulaiTanggal?: string | null
  sampaiTanggal?: string | null
  horizonMinggu: number
  aktif: boolean
  createdAt: string
  updatedAt: string
}

export type KelasJadwalInput = {
  hari: number[]
  mulai: string
  selesai?: string | null
  topikDefault?: string | null
  mulaiTanggal?: string | null
  sampaiTanggal?: string | null
  horizonMinggu: number
  aktif: boolean
}

export function getJadwal(kelasId: string) {
  return apiFetch<KelasJadwal | null>(`/api/kelas/${encodeURIComponent(kelasId)}/jadwal`)
}

export function putJadwal(kelasId: string, input: KelasJadwalInput) {
  return apiFetch<KelasJadwal>(`/api/kelas/${encodeURIComponent(kelasId)}/jadwal`, { method: 'PUT', body: input })
}

export function deleteJadwal(kelasId: string) {
  return apiFetch<void>(`/api/kelas/${encodeURIComponent(kelasId)}/jadwal`, { method: 'DELETE' })
}

export function generateJadwal(kelasId: string) {
  return apiFetch<{ created: number }>(`/api/kelas/${encodeURIComponent(kelasId)}/jadwal/generate`, { method: 'POST' })
}
