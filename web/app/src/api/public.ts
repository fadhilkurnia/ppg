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

export type PublicAttendanceResponse = Attendance & {
  // Pre-built wa.me click-to-chat URL the success screen opens so the
  // submitter forwards the formatted report from their own WhatsApp.
  // Empty when the server has no WHATSAPP_ADMIN_NUMBER configured.
  waMeUrl: string
}

export function submitPublicAttendance(input: PublicAttendanceInput) {
  return apiFetch<PublicAttendanceResponse>('/api/public/attendances', {
    method: 'POST',
    body: input,
  })
}
