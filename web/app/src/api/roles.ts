import { apiFetch } from './client'
import type { RoleRecord } from './types'

export type { RoleRecord }

export type CreateRoleInput = {
  id: string
  label: string
  canLogin?: boolean
  manageableRoleIds?: string[]
  sortOrder?: number
}

export type UpdateRoleInput = {
  newId?: string
  label?: string
  canLogin?: boolean
  manageableRoleIds?: string[]
  sortOrder?: number
}

export function listRoles() {
  return apiFetch<{ items: RoleRecord[] }>('/api/roles')
}

export function getRole(id: string) {
  return apiFetch<RoleRecord>(`/api/roles/${encodeURIComponent(id)}`)
}

export function createRole(input: CreateRoleInput) {
  return apiFetch<RoleRecord>('/api/roles', {
    method: 'POST',
    body: input,
  })
}

export function updateRole(id: string, input: UpdateRoleInput) {
  return apiFetch<RoleRecord>(`/api/roles/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: input,
  })
}

export function deleteRole(id: string) {
  return apiFetch<{ status: string }>(`/api/roles/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}
