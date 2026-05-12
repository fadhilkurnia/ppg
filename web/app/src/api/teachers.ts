import { apiFetch } from './client'
import type { Teacher, TeacherInput, TeacherList, TeacherStatus } from './types'

export type TeacherListQuery = {
  q?: string
  status?: TeacherStatus
  daerah?: string
  gender?: 'male' | 'female'
  limit?: number
  offset?: number
}

export function listTeachers(params: TeacherListQuery = {}) {
  const q = new URLSearchParams()
  if (params.q) q.set('q', params.q)
  if (params.status) q.set('status', params.status)
  if (params.daerah) q.set('daerah', params.daerah)
  if (params.gender) q.set('gender', params.gender)
  if (params.limit !== undefined) q.set('limit', String(params.limit))
  if (params.offset !== undefined) q.set('offset', String(params.offset))
  const qs = q.toString()
  return apiFetch<TeacherList>(`/api/teachers${qs ? `?${qs}` : ''}`)
}

export function getTeacher(id: string) {
  return apiFetch<Teacher>(`/api/teachers/${encodeURIComponent(id)}`)
}

export function createTeacher(input: TeacherInput) {
  return apiFetch<Teacher>('/api/teachers', { method: 'POST', body: input })
}

export function updateTeacher(id: string, input: TeacherInput) {
  return apiFetch<Teacher>(`/api/teachers/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: input,
  })
}

export function deleteTeacher(id: string) {
  return apiFetch<void>(`/api/teachers/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
