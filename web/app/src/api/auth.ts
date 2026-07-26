import { apiFetch } from './client'
import { setApiBase } from './base'
import type { AuthMe, User } from './types'

// login authenticates the user and pushes the server's apiBase into the
// shared module state so subsequent calls use the dynamic prefix.
export async function login(identifier: string, password: string): Promise<User> {
  // Login is the bootstrap endpoint that issues a fresh dynamic prefix. Reset
  // first so a stale in-memory prefix from another tab/session cannot trap
  // this tab in a bad_api_path -> login -> bad_api_path loop.
  setApiBase('/api')
  const res = await apiFetch<AuthMe>('/api/auth/login', {
    method: 'POST',
    body: { identifier, password },
  })
  setApiBase(res.apiBase)
  return res
}

export function logout(): Promise<void> {
  return apiFetch<void>('/api/auth/logout', { method: 'POST' })
}

// me returns the current user and refreshes the shared apiBase so a
// reloaded SPA recovers the dynamic prefix even when the meta-tag
// injection was missed (e.g. dev mode behind Vite).
export async function me(): Promise<User> {
  const res = await apiFetch<AuthMe>('/api/auth/me')
  setApiBase(res.apiBase)
  return res
}
