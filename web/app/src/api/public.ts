import { apiFetch } from './client'
import type { Attendance, AttendanceStatus } from './types'

export type PublicOption = {
  id: string
  name: string
  nickname?: string
}

export type PublicOptionList = {
  items: PublicOption[]
}

export type PublicAttendanceInput = {
  date: string
  durationMin?: number
  teacherId: string
  studentId: string
  status: AttendanceStatus
  materi?: string
  submittedPhone: string
}

export function listPublicTeachers() {
  return apiFetch<PublicOptionList>('/api/public/teachers')
}

export function listPublicStudents() {
  return apiFetch<PublicOptionList>('/api/public/students')
}

export function submitPublicAttendance(input: PublicAttendanceInput) {
  return apiFetch<Attendance>('/api/public/attendances', {
    method: 'POST',
    body: input,
  })
}
