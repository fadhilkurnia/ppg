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

export type WAChallengeInfo = {
  code: string
  pollToken: string
  waLink: string
  messageText: string
  botPhone: string
  expiresAt: string
}

export type WAPollResult = {
  status: 'pending' | 'approved' | 'expired'
  user?: User
  apiBase?: string
}

export async function createWAChallenge(): Promise<WAChallengeInfo> {
  return apiFetch<WAChallengeInfo>('/api/auth/wa/challenge', {
    method: 'POST',
  })
}

export async function pollWAChallenge(code: string, pollToken: string): Promise<WAPollResult> {
  const res = await apiFetch<WAPollResult>(`/api/auth/wa/poll?code=${encodeURIComponent(code)}&pollToken=${encodeURIComponent(pollToken)}`)
  if (res.status === 'approved' && res.apiBase) {
    setApiBase(res.apiBase)
  }
  return res
}

export async function createLinkWAChallenge(phone?: string): Promise<WAChallengeInfo> {
  return apiFetch<WAChallengeInfo>('/api/auth/me/wa/challenge', {
    method: 'POST',
    body: phone ? { phone } : {},
  })
}

export async function deleteWAPhone(): Promise<void> {
  return apiFetch<void>('/api/auth/me/wa', {
    method: 'DELETE',
  })
}

export type FirstLoginInput = {
  username?: string
  newPassword: string
}

export async function changeFirstLoginCredentials(input: FirstLoginInput): Promise<User> {
  const res = await apiFetch<AuthMe>('/api/auth/me/first-login', {
    method: 'POST',
    body: input,
  })
  if (res.apiBase) {
    setApiBase(res.apiBase)
  }
  return res
}

export async function requestForgotPassword(identifier: string): Promise<import('./types').ForgotPasswordRequestResponse> {
  return apiFetch<import('./types').ForgotPasswordRequestResponse>('/api/auth/password/forgot/request', {
    method: 'POST',
    body: { identifier },
  })
}

export async function resetPasswordWithOTP(input: import('./types').ResetPasswordWithOTPInput): Promise<User> {
  const res = await apiFetch<AuthMe>('/api/auth/password/forgot/reset', {
    method: 'POST',
    body: input,
  })
  if (res.apiBase) {
    setApiBase(res.apiBase)
  }
  return res
}

export async function createWAResetChallenge(): Promise<import('./types').WAResetChallengeResponse> {
  return apiFetch<import('./types').WAResetChallengeResponse>('/api/auth/password/reset-challenge', {
    method: 'POST',
  })
}

export async function pollWAResetStatus(
  code: string,
  pollToken: string,
): Promise<import('./types').WAResetStatusResponse> {
  const params = new URLSearchParams({ code, pollToken })
  return apiFetch<import('./types').WAResetStatusResponse>(
    `/api/auth/password/reset-challenge/status?${params.toString()}`,
  )
}

export async function verifyWAResetOTP(
  code: string,
  pollToken: string,
  otp: string,
): Promise<import('./types').VerifyResetWAOTPResponse> {
  return apiFetch<import('./types').VerifyResetWAOTPResponse>(
    '/api/auth/password/reset-challenge/verify-otp',
    {
      method: 'POST',
      body: { code, pollToken, otp },
    },
  )
}

export async function completeWAResetPassword(
  input: import('./types').CompleteResetWAPasswordInput,
): Promise<User> {
  const res = await apiFetch<AuthMe>('/api/auth/password/reset-challenge/complete', {
    method: 'POST',
    body: input,
  })
  if (res.apiBase) {
    setApiBase(res.apiBase)
  }
  return res
}

export async function getUserPhones(): Promise<import('./types').UserPhone[]> {
  return apiFetch<import('./types').UserPhone[]>('/api/auth/me/phones')
}

export async function setPrimaryPhone(phoneId: string): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/api/auth/me/phones/${encodeURIComponent(phoneId)}/primary`, {
    method: 'POST',
  })
}

export async function deleteUserPhone(phoneId: string): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/api/auth/me/phones/${encodeURIComponent(phoneId)}`, {
    method: 'DELETE',
  })
}

export async function getGoogleConfig(): Promise<import('./types').GoogleConfigResponse> {
  return apiFetch<import('./types').GoogleConfigResponse>('/api/auth/google/config')
}

export async function verifyGoogleCredential(credential: string): Promise<User> {
  const res = await apiFetch<AuthMe>('/api/auth/google/verify', {
    method: 'POST',
    body: { credential },
  })
  if (res.apiBase) {
    setApiBase(res.apiBase)
  }
  return res
}

export async function linkGoogleCredential(credential: string): Promise<User> {
  return apiFetch<User>('/api/auth/me/google/link', {
    method: 'POST',
    body: { credential },
  })
}
