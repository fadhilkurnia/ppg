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

export type UpdateMeInput = {
  name?: string
  nickname?: string | null
  timezone?: string | null
  noHp?: string | null
  alamat?: string | null
  desa?: string | null
  daerah?: string | null
  kelompok?: string | null
  tempatLahir?: string | null
  pendidikan?: string | null
  pekerjaan?: string | null
  gender?: 'male' | 'female' | null
  hideDob?: boolean
  dateOfBirth?: string | null
}

export function updateMe(input: UpdateMeInput) {
  return apiFetch<User>('/api/auth/me', { method: 'PATCH', body: input })
}

export function setMyPassword(password: string) {
  return apiFetch<void>('/api/auth/me/password', { method: 'POST', body: { password } })
}

export async function uploadMyPhoto(file: File): Promise<User> {
  const fd = new FormData()
  fd.append('file', file)
  return apiFetch<User>('/api/auth/me/photo', { method: 'POST', body: fd })
}

export function deleteMyPhoto() {
  return apiFetch<User>('/api/auth/me/photo', { method: 'DELETE' })
}
