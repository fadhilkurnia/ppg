import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError, getToken, setToken } from './api'

// Role union accepts both GNRS roles ('admin' | 'staff') and sitrac-v3 roles
// ('pengurus' | 'guru' | 'ortu' | 'murid'), so components from either project
// type-check without further changes.
export type Role = 'admin' | 'staff' | 'pengurus' | 'guru' | 'ortu' | 'murid'

export interface User {
  id: string
  email: string
  name: string
  role: Role
  username?: string
  createdAt?: string
  updatedAt?: string
  // sitrac-v3 optional profile fields — not populated by the GNRS backend, but
  // declared here so dropped-in v3 components compile.
  role2?: Role | null
  userCode?: string | null
  photo?: string | null
  noHp?: string | null
  country?: string | null
  state?: string | null
  city?: string | null
  bio?: string | null
  tanggalLahir?: string | null
  tempatLahir?: string | null
  namaPanggilan?: string | null
  jenisKelamin?: string | null
  pendidikanTerakhir?: string | null
  sekolah?: string | null
  pekerjaan?: string | null
  daerah?: string | null
  desa?: string | null
  kelompok?: string | null
  timezone?: string | null
  photoUrl?: string | null
  nickname?: string | null
  alamat?: string | null
  // Taaruf-style biodata extensions (populated by the GNRS backend).
  pendidikan?: string | null
  gender?: 'male' | 'female' | null
  hideDob?: boolean
  urutan?: number
  dateOfBirth?: string | null
  tglDaftar?: string | null
  active?: boolean
}

export const ME_QUERY_KEY = ['auth', 'me'] as const

interface AuthCtxShape {
  user: User | null
  loading: boolean
  login: (identifier: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
  hasRole: (r: Role) => boolean
  primaryRole: Role | null
}

const AuthCtx = createContext<AuthCtxShape | null>(null)

async function fetchMe(): Promise<User | null> {
  try {
    // GNRS backend returns the User object directly.
    const u = await api.get<User>('/auth/me')
    return u ?? null
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null
    throw err
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const u = await fetchMe()
      qc.setQueryData(ME_QUERY_KEY, u)
      setUser(u)
    } finally {
      setLoading(false)
    }
  }, [qc])

  useEffect(() => {
    refresh()
  }, [refresh])

  const login = useCallback(
    async (identifier: string, password: string) => {
      // GNRS backend endpoint: POST /api/auth/login → User (sets httpOnly cookie).
      // sitrac-v3 backend returns { token, user } — handle both shapes.
      const res = await api.post<unknown>('/auth/login', { identifier, password, username: identifier })
      const token = (res as any)?.token as string | undefined
      const userResp = ((res as any)?.user ?? res) as User
      if (token) setToken(token)
      qc.setQueryData(ME_QUERY_KEY, userResp)
      setUser(userResp)
    },
    [qc],
  )

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout')
    } catch {
      // best-effort
    }
    setToken(null)
    qc.setQueryData(ME_QUERY_KEY, null)
    setUser(null)
  }, [qc])

  const hasRole = useCallback(
    (r: Role) => !!user && (user.role === r || user.role2 === r),
    [user],
  )

  const primaryRole = user?.role ?? null

  return (
    <AuthCtx.Provider value={{ user, loading, login, logout, refresh, hasRole, primaryRole }}>
      {children}
    </AuthCtx.Provider>
  )
}

export function useAuth() {
  const c = useContext(AuthCtx)
  if (!c) throw new Error('useAuth must be inside AuthProvider')
  return c
}

// ---- Compatibility shims for existing GNRS pages that use TanStack Query
//      directly (instead of useAuth). These keep the existing route modules
//      working unchanged.

export function useMe() {
  return useQuery<User | null>({
    queryKey: ME_QUERY_KEY,
    queryFn: fetchMe,
    staleTime: 60_000,
    retry: false,
  })
}

export function useSetMe() {
  const qc = useQueryClient()
  return (u: User | null) => qc.setQueryData(ME_QUERY_KEY, u)
}

export { getToken, setToken }
