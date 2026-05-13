import { resolveApiPath } from './base'

export class ApiError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

// isAuthError reports whether err means "the SPA can't trust the current
// session and should bounce the user to /login." Covers:
//   - 401: missing/invalid JWT.
//   - 403 api_path_required: caller hit /api/* without a dynamic prefix,
//     i.e. no session has been established yet.
//   - 403 bad_api_path: caller's auth_path cookie no longer matches the
//     prefix in the URL, i.e. the session is stale.
// Other 403s (e.g. role-gated routes) keep their normal error semantics.
export function isAuthError(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false
  if (err.status === 401) return true
  if (err.status === 403 && (err.code === 'api_path_required' || err.code === 'bad_api_path')) {
    return true
  }
  return false
}

type RequestOptions = Omit<RequestInit, 'body'> & { body?: unknown }

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, headers, ...rest } = options
  const init: RequestInit = {
    credentials: 'include',
    ...rest,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }

  const res = await fetch(resolveApiPath(path), init)

  if (res.status === 204) {
    return undefined as T
  }

  let data: unknown = null
  const text = await res.text()
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      // non-JSON response; leave as null
    }
  }

  if (!res.ok) {
    const errBody = (data as { error?: { code?: string; message?: string } } | null)?.error
    throw new ApiError(
      res.status,
      errBody?.code ?? 'unknown',
      errBody?.message ?? res.statusText,
    )
  }

  return data as T
}
