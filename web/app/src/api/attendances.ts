import { apiFetch } from './client'

export type AttendanceStatus = 'hadir' | 'izin_murid' | 'izin_guru' | 'by_vn' | 'alfa'

export const ATTENDANCE_STATUS_LABEL: Record<AttendanceStatus, string> = {
  hadir: 'Hadir',
  izin_murid: 'Izin (Murid)',
  izin_guru: 'Izin (Guru)',
  by_vn: 'Via Voice Note',
  alfa: 'Alfa',
}

export type Attendance = {
  id: string
  date: string
  durationMin?: number | null
  teacherId: string
  teacherName: string
  studentId: string
  studentName: string
  status: AttendanceStatus
  materi?: string | null
  createdAt: string
  updatedAt: string
}

export type AttendanceListParams = {
  teacherId?: string
  studentId?: string
  status?: AttendanceStatus
  dateFrom?: string
  dateTo?: string
  limit?: number
  offset?: number
}

export type AttendanceListResult = { items: Attendance[]; total: number }

export type AttendanceInput = {
  date: string
  durationMin?: number | null
  teacherId: string
  studentId: string
  status: AttendanceStatus
  materi?: string | null
}

export type AttendanceTotals = {
  sessions: number
  hours: number
  last30Days: number
  activePairs: number
}
export type MonthlyBucket = { month: string; sessions: number; hours: number }
export type Bucket = { label: string; count: number }
export type StudentAggregate = {
  studentId: string
  studentName: string
  totalSessions: number
  hadirSessions: number
  hadirRate: number
  totalHours: number
  lastDate?: string | null
}
export type TeacherAggregate = {
  teacherId: string
  teacherName: string
  totalSessions: number
  totalHours: number
  uniqueStudents: number
  lastDate?: string | null
}
export type AttendanceStats = {
  total: AttendanceTotals
  monthly: MonthlyBucket[]
  byStatus: Bucket[]
  byStudent: StudentAggregate[]
  byTeacher: TeacherAggregate[]
  availableYears: number[]
}

export function listAttendances(params: AttendanceListParams = {}) {
  const sp = new URLSearchParams()
  if (params.teacherId) sp.set('teacherId', params.teacherId)
  if (params.studentId) sp.set('studentId', params.studentId)
  if (params.status) sp.set('status', params.status)
  if (params.dateFrom) sp.set('dateFrom', params.dateFrom)
  if (params.dateTo) sp.set('dateTo', params.dateTo)
  if (params.limit) sp.set('limit', String(params.limit))
  if (params.offset) sp.set('offset', String(params.offset))
  const qs = sp.toString()
  return apiFetch<AttendanceListResult>(`/api/attendances${qs ? `?${qs}` : ''}`)
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

export function getAttendanceStats(params: { dateFrom?: string; dateTo?: string } = {}) {
  const sp = new URLSearchParams()
  if (params.dateFrom) sp.set('dateFrom', params.dateFrom)
  if (params.dateTo) sp.set('dateTo', params.dateTo)
  const qs = sp.toString()
  return apiFetch<AttendanceStats>(`/api/attendances/stats${qs ? `?${qs}` : ''}`)
}
