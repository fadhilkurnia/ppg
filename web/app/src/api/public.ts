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
  // Pre-built wa.me click-to-chat URL targeted at the submitted phone.
  // The /absen page navigates to it after a successful POST so WhatsApp
  // opens with the formatted report pre-filled and the submitter taps
  // Send. Empty only on the unreachable path where the server couldn't
  // build a URL (submittedPhone is required + validated).
  waMeUrl: string
}

export function submitPublicAttendance(input: PublicAttendanceInput) {
  return apiFetch<PublicAttendanceResponse>('/api/public/attendances', {
    method: 'POST',
    body: input,
  })
}
