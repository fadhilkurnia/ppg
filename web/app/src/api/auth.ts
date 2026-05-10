import { apiFetch } from './client'
import type { User } from './types'

export function login(identifier: string, password: string) {
  return apiFetch<User>('/api/auth/login', {
    method: 'POST',
    body: { identifier, password },
  })
}

export function logout() {
  return apiFetch<void>('/api/auth/logout', { method: 'POST' })
}

export function me() {
  return apiFetch<User>('/api/auth/me')
}
