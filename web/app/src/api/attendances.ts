import { apiFetch } from './client'
import type {
  Attendance,
  AttendanceInput,
  AttendanceList,
  AttendanceStatus,
} from './types'

export type AttendanceListQuery = {
  dateFrom?: string
  dateTo?: string
  teacherId?: string
  studentId?: string
  status?: AttendanceStatus
  limit?: number
  offset?: number
}

export function listAttendances(params: AttendanceListQuery = {}) {
  const q = new URLSearchParams()
  if (params.dateFrom) q.set('dateFrom', params.dateFrom)
  if (params.dateTo) q.set('dateTo', params.dateTo)
  if (params.teacherId) q.set('teacherId', params.teacherId)
  if (params.studentId) q.set('studentId', params.studentId)
  if (params.status) q.set('status', params.status)
  if (params.limit !== undefined) q.set('limit', String(params.limit))
  if (params.offset !== undefined) q.set('offset', String(params.offset))
  const qs = q.toString()
  return apiFetch<AttendanceList>(`/api/attendances${qs ? `?${qs}` : ''}`)
}

export function getAttendance(id: string) {
  return apiFetch<Attendance>(`/api/attendances/${encodeURIComponent(id)}`)
}

export function createAttendance(input: AttendanceInput) {
  return apiFetch<Attendance>('/api/attendances', { method: 'POST', body: input })
}

export function updateAttendance(id: string, input: AttendanceInput) {
  return apiFetch<Attendance>(`/api/attendances/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: input,
  })
}

export function deleteAttendance(id: string) {
  return apiFetch<void>(`/api/attendances/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
