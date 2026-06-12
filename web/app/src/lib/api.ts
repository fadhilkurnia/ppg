// Compatibility-layer API client.
//
// - Sends `credentials: 'include'` so the GNRS backend can read its httpOnly
//   JWT cookie (default auth path).
// - Also sends `Authorization: Bearer <token>` if a token has been stashed in
//   localStorage. sitrac-v3 components rely on this pattern, so keeping it
//   here lets them drop in unchanged.
const API_BASE = (import.meta as any).env?.VITE_API_URL || '/api'
const TOKEN_KEY = 'gnrs_token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(t: string | null) {
  if (t) localStorage.setItem(TOKEN_KEY, t)
  else localStorage.removeItem(TOKEN_KEY)
}

export class ApiError extends Error {
  status: number
  code: string
  data: unknown
  constructor(status: number, code: string, message: string, data?: unknown) {
    super(message)
    this.status = status
    this.code = code
    this.data = data
  }
}

type RequestOptions = Omit<RequestInit, 'body'> & { body?: unknown }

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, headers, ...rest } = options
  const isFormData = body instanceof FormData
  const url = path.startsWith('http') || path.startsWith('/api')
    ? path
    : `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`

  const reqHeaders = new Headers(headers as HeadersInit | undefined)
  reqHeaders.set('Accept', 'application/json')
  if (body !== undefined && !isFormData && !reqHeaders.has('Content-Type')) {
    reqHeaders.set('Content-Type', 'application/json')
  }
  const tok = getToken()
  if (tok && !reqHeaders.has('Authorization')) {
    reqHeaders.set('Authorization', `Bearer ${tok}`)
  }

  const res = await fetch(url, {
    credentials: 'include',
    ...rest,
    headers: reqHeaders,
    body:
      body === undefined
        ? undefined
        : isFormData
        ? (body as FormData)
        : JSON.stringify(body),
  })

  if (res.status === 204) return undefined as T

  let data: any = null
  const text = await res.text()
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }

  if (!res.ok) {
    const errBody = (data as { error?: { code?: string; message?: string } } | null)?.error
    throw new ApiError(
      res.status,
      errBody?.code ?? 'unknown',
      errBody?.message || (typeof data === 'string' ? data : '') || res.statusText,
      data,
    )
  }

  return data as T
}

export const api = {
  get: <T>(p: string) => request<T>(p, { method: 'GET' }),
  post: <T>(p: string, b?: unknown) => request<T>(p, { method: 'POST', body: b }),
  put: <T>(p: string, b?: unknown) => request<T>(p, { method: 'PUT', body: b }),
  patch: <T>(p: string, b?: unknown) => request<T>(p, { method: 'PATCH', body: b }),
  delete: <T>(p: string) => request<T>(p, { method: 'DELETE' }),
}

// Back-compat: GNRS's existing api/* modules import { apiFetch, ApiError } from './client'.
// Re-exporting from here keeps both worlds working.
export const apiFetch = <T>(path: string, options: RequestOptions = {}) =>
  request<T>(path, options)
