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

type RequestOptions = Omit<RequestInit, 'body'> & { body?: unknown }

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, headers, ...rest } = options
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData
  const hasBody = body !== undefined

  const init: RequestInit = {
    credentials: 'include',
    ...rest,
    headers: {
      Accept: 'application/json',
      ...(hasBody && !isFormData ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: hasBody ? (isFormData ? (body as FormData) : JSON.stringify(body)) : undefined,
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

// apiDownload fetches a non-JSON resource (e.g. a CSV stream) and returns
// the raw Response so callers can pull a Blob. Goes through resolveApiPath
// so the dynamic per-session prefix is honoured.
export async function apiDownload(path: string): Promise<Response> {
  const res = await fetch(resolveApiPath(path), { credentials: 'include' })
  if (!res.ok) {
    let code = 'unknown'
    let message = res.statusText
    try {
      const text = await res.text()
      if (text) {
        const parsed = JSON.parse(text) as { error?: { code?: string; message?: string } }
        code = parsed.error?.code ?? code
        message = parsed.error?.message ?? message
      }
    } catch {
      // non-JSON error body; keep statusText
    }
    throw new ApiError(res.status, code, message)
  }
  return res
}
