import { apiFetch } from './client'
import type { Student, StudentTeacher, StudentTeacherDetail, Teacher } from './types'

export type StudentTeacherQuery = {
  studentId?: string
  teacherId?: string
}

export function listStudentTeachers(params: StudentTeacherQuery = {}) {
  const q = new URLSearchParams()
  if (params.studentId) q.set('studentId', params.studentId)
  if (params.teacherId) q.set('teacherId', params.teacherId)
  const qs = q.toString()
  return apiFetch<StudentTeacherDetail[]>(`/api/student-teachers${qs ? `?${qs}` : ''}`)
}

export function assignStudentTeacher(studentId: string, teacherId: string, notes?: string) {
  return apiFetch<StudentTeacher>('/api/student-teachers', {
    method: 'POST',
    body: { studentId, teacherId, notes },
  })
}

export function unassignStudentTeacher(studentId: string, teacherId: string) {
  const q = new URLSearchParams({ studentId, teacherId })
  return apiFetch<{ status: string }>(`/api/student-teachers?${q.toString()}`, {
    method: 'DELETE',
  })
}

export function getTeachersForStudent(studentId: string) {
  return apiFetch<Teacher[]>(`/api/students/${encodeURIComponent(studentId)}/teachers`)
}

export function setTeachersForStudent(studentId: string, teacherIds: string[]) {
  return apiFetch<Teacher[]>(`/api/students/${encodeURIComponent(studentId)}/teachers`, {
    method: 'PUT',
    body: { teacherIds },
  })
}

export function getStudentsForTeacher(teacherId: string) {
  return apiFetch<Student[]>(`/api/teachers/${encodeURIComponent(teacherId)}/students`)
}

export function setStudentsForTeacher(teacherId: string, studentIds: string[]) {
  return apiFetch<Student[]>(`/api/teachers/${encodeURIComponent(teacherId)}/students`, {
    method: 'PUT',
    body: { studentIds },
  })
}
