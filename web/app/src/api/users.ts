import { apiFetch } from './client'
import type {
  CreateUserInput,
  UpdateUserInput,
  User,
  UserList,
} from './types'

export type ListUsersQuery = {
  q?: string
  role?: string
  status?: string
  limit?: number
  offset?: number
}

export function listUsers(params: ListUsersQuery = {}) {
  const q = new URLSearchParams()
  if (params.q) q.set('q', params.q)
  if (params.role) q.set('role', params.role)
  if (params.status) q.set('status', params.status)
  if (params.limit !== undefined) q.set('limit', String(params.limit))
  if (params.offset !== undefined) q.set('offset', String(params.offset))
  const qs = q.toString()
  return apiFetch<UserList>(`/api/users${qs ? `?${qs}` : ''}`)
}

export function getUser(id: string) {
  return apiFetch<User>(`/api/users/${encodeURIComponent(id)}`)
}

export function createUser(input: CreateUserInput) {
  return apiFetch<User>('/api/users', { method: 'POST', body: input })
}

export function updateUser(id: string, input: UpdateUserInput) {
  return apiFetch<User>(`/api/users/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: input,
  })
}

export function setUserPassword(id: string, input: { currentPassword?: string; newPassword: string }) {
  return apiFetch<void>(`/api/users/${encodeURIComponent(id)}/password`, {
    method: 'POST',
    body: input,
  })
}

export function archiveUser(id: string) {
  return apiFetch<void>(`/api/users/${encodeURIComponent(id)}/archive`, {
    method: 'POST',
  })
}

export function checkUsernameAvailability(username: string, excludeUserId?: string) {
  const qs = new URLSearchParams()
  if (username) qs.set('username', username)
  if (excludeUserId) qs.set('excludeUserId', excludeUserId)
  return apiFetch<{ available: boolean; message?: string }>(`/api/users/check-username?${qs.toString()}`)
}

