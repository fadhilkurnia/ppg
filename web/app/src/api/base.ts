// Module-level dynamic API base. The server injects a 12-hex prefix into
// the <meta name="ppgus-api-base"> tag of index.html when the
// DYNAMIC_API_PATH feature is enabled; otherwise the meta content is /api.
// The login flow may also push a fresh base via setApiBase() without a
// page reload.
//
// See docs/missing-features/50-security-hardening.md §3.

const META_NAME = 'ppgus-api-base'
const CANONICAL_BASE = '/api'
const PLACEHOLDER = '__API_BASE__'

function readMetaBase(): string {
  if (typeof document === 'undefined') return CANONICAL_BASE
  const meta = document.querySelector<HTMLMetaElement>(`meta[name="${META_NAME}"]`)
  const raw = meta?.getAttribute('content')?.trim()
  if (!raw || raw === PLACEHOLDER) return CANONICAL_BASE
  return normalize(raw)
}

function normalize(base: string): string {
  if (!base.startsWith('/')) return `/${base}`
  if (base.length > 1 && base.endsWith('/')) return base.slice(0, -1)
  return base
}

let currentBase: string = readMetaBase()

export function getApiBase(): string {
  return currentBase
}

export function setApiBase(base: string): void {
  currentBase = normalize(base)
}

/**
 * Rewrites an absolute API path so it goes through the dynamic prefix.
 *
 * - Paths beginning with `/api/...` or exactly `/api` are mapped onto the
 *   current base (`/api/foo` -> `/abc123def456/foo` when dynamic; identity
 *   when canonical).
 * - Other paths are returned unchanged so static assets and SPA routes
 *   stay untouched.
 */
export function resolveApiPath(path: string): string {
  if (path === CANONICAL_BASE) return currentBase
  if (path.startsWith(`${CANONICAL_BASE}/`)) {
    return currentBase + path.slice(CANONICAL_BASE.length)
  }
  return path
}
