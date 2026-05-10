import { apiFetch } from './client'
import type { Student, StudentInput, StudentList } from './types'

export type ListQuery = {
  q?: string
  limit?: number
  offset?: number
}

export function listStudents(params: ListQuery = {}) {
  const q = new URLSearchParams()
  if (params.q) q.set('q', params.q)
  if (params.limit !== undefined) q.set('limit', String(params.limit))
  if (params.offset !== undefined) q.set('offset', String(params.offset))
  const qs = q.toString()
  return apiFetch<StudentList>(`/api/students${qs ? `?${qs}` : ''}`)
}

export function getStudent(id: string) {
  return apiFetch<Student>(`/api/students/${encodeURIComponent(id)}`)
}

export function createStudent(input: StudentInput) {
  return apiFetch<Student>('/api/students', { method: 'POST', body: input })
}

export function updateStudent(id: string, input: StudentInput) {
  return apiFetch<Student>(`/api/students/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: input,
  })
}

export function deleteStudent(id: string) {
  return apiFetch<void>(`/api/students/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
