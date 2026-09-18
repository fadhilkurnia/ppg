import { resolveApiPath } from './base'
import { ApiError, apiFetch } from './client'
import type { BulkReport } from './bulk'
import type { MateriAjar } from './kurikulum'

export type PencapaianStatus = 'belum' | 'proses' | 'tuntas'

export type Pencapaian = {
  id: string
  studentId: string
  materiAjarId: string
  status: PencapaianStatus
  nilaiAngka?: number | null
  tanggal?: string | null
  catatan?: string | null
  recordedBy?: string | null
  updatedAt: string
  materi: MateriAjar
  tingkatNama: string
  tingkatUrutan: number
}

export type PencapaianInput = {
  studentId: string
  materiAjarId: string
  status: PencapaianStatus
  nilaiAngka?: number | null
  tanggal?: string | null
  catatan?: string | null
}

export type ReportCell = {
  month: number
  count: number
  avg?: number | null
}

export type ReportRow = {
  materi: MateriAjar
  cells: ReportCell[]
}

export function listPencapaian(studentId: string) {
  return apiFetch<Pencapaian[]>(`/api/pencapaian?studentId=${encodeURIComponent(studentId)}`)
}

export function upsertPencapaian(input: PencapaianInput) {
  return apiFetch<Pencapaian>('/api/pencapaian', { method: 'POST', body: input })
}

export function deletePencapaian(id: string) {
  return apiFetch<void>(`/api/pencapaian/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function getClassReport(tingkatId: string, semester: number) {
  return apiFetch<ReportRow[]>(
    `/api/achievement/report?tingkatId=${encodeURIComponent(tingkatId)}&semester=${semester}`,
  )
}

export type PencapaianNote = {
  id: string
  studentId: string
  materiAjarId: string
  note: string
  status?: PencapaianStatus | null
  nilaiAngka?: number | null
  authorId?: string | null
  authorName?: string | null
  createdAt: string
}

export type CreatePencapaianNoteInput = {
  studentId: string
  materiAjarId: string
  note: string
  status?: PencapaianStatus | null
  nilaiAngka?: number | null
}

export function listPencapaianNotes(studentId: string, materiAjarId: string) {
  return apiFetch<PencapaianNote[]>(
    `/api/pencapaian/notes?studentId=${encodeURIComponent(studentId)}&materiAjarId=${encodeURIComponent(materiAjarId)}`,
  )
}

export function createPencapaianNote(input: CreatePencapaianNoteInput) {
  return apiFetch<PencapaianNote>('/api/pencapaian/notes', {
    method: 'POST',
    body: input,
  })
}

export function deletePencapaianNote(id: string) {
  return apiFetch<void>(`/api/pencapaian/notes/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function importPencapaianMatrix(
  file: File,
  params: { studentId: string; tingkatId: string; semester: number },
): Promise<BulkReport> {
  const form = new FormData()
  form.append('file', file)
  form.append('mode', 'upsert')

  const qs = new URLSearchParams({
    studentId: params.studentId,
    tingkatId: params.tingkatId,
    semester: String(params.semester),
  })
  const res = await fetch(resolveApiPath(`/api/pencapaian/matrix/import?${qs}`), {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json' },
    body: form,
  })

  let data: unknown = null
  const text = await res.text()
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      // non-JSON response; leave as null
    }
  }

  if (!res.ok) {
    const errBody = (data as { error?: { code?: string; message?: string } } | null)?.error
    throw new ApiError(res.status, errBody?.code ?? 'unknown', errBody?.message ?? res.statusText)
  }

  return data as BulkReport
}

export const NILAI_GRADES = [
  { min: 90, label: 'baikSekali' },
  { min: 80, label: 'baik' },
  { min: 70, label: 'cukup' },
  { min: 60, label: 'kurang' },
] as const

export function gradeLabel(nilai: number): string {
  for (const g of NILAI_GRADES) {
    if (nilai >= g.min) return g.label
  }
  return 'kurang'
}
