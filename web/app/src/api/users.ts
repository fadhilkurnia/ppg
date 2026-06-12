import { apiFetch } from './client'

// Canonical roles (5). Legacy "staff" rows may still exist in the DB; the
// backend tolerates them but the picker only exposes these five.
export const USER_ROLES = ['admin', 'pengurus', 'guru', 'ortu', 'murid'] as const
export type UserRole = (typeof USER_ROLES)[number]

export const STUDENT_LEVELS = ['Caberawit', 'Pra Remaja', 'Remaja', 'Pra Nikah'] as const
export type StudentLevel = (typeof STUDENT_LEVELS)[number]

export type Gender = 'male' | 'female'

export type ManagedUser = {
  // Auth
  id: string
  email: string
  username?: string
  name: string
  role: UserRole
  active: boolean

  // Shared profile
  nickname?: string
  dateOfBirth?: string
  gender?: Gender
  noHp?: string
  alamat?: string
  kelompok?: string

  // Murid
  level?: StudentLevel
  parentName?: string
  parentTitle?: string
  parentPhone?: string
  parentPhoneRegion?: 'ID' | 'SG' | 'US' | 'CA'
  parentEmail?: string

  // Locality + free-form notes (kept available to all roles).
  desa?: string
  daerah?: string
  notes?: string

  // Photo
  photoUrl?: string

  // Taaruf-style biodata extensions.
  userCode?: string | null
  tempatLahir?: string | null
  pendidikan?: string | null
  pekerjaan?: string | null
  urutan?: number
  hideDob?: boolean
  tglDaftar?: string | null
  timezone?: string | null

  createdAt: string
  updatedAt: string
}

export type ManagedUserList = {
  items: ManagedUser[]
  total: number
}

export type UserCreateInput = {
  email: string
  username?: string
  name: string
  password: string
  role: UserRole
  // optional profile bits
  nickname?: string
  dateOfBirth?: string
  gender?: Gender
  noHp?: string
  alamat?: string
  kelompok?: string
  level?: StudentLevel
  parentName?: string
  parentTitle?: string
  parentPhone?: string
  parentPhoneRegion?: 'ID' | 'SG' | 'US' | 'CA'
  parentEmail?: string
  desa?: string
  daerah?: string
  notes?: string
  // Taaruf-style biodata
  userCode?: string
  tempatLahir?: string
  pendidikan?: string
  pekerjaan?: string
  urutan?: number
  hideDob?: boolean
  tglDaftar?: string
}

// All fields optional. Pass an empty string to clear nullable fields where
// the backend supports it (username, level, dateOfBirth, timezone).
export type UserUpdateInput = Partial<Omit<UserCreateInput, 'password'>> & {
  active?: boolean
}

export function listUsers(
  params: { q?: string; role?: UserRole; active?: boolean; limit?: number; offset?: number } = {},
) {
  const sp = new URLSearchParams()
  if (params.q) sp.set('q', params.q)
  if (params.role) sp.set('role', params.role)
  if (params.active !== undefined) sp.set('active', String(params.active))
  if (params.limit) sp.set('limit', String(params.limit))
  if (params.offset) sp.set('offset', String(params.offset))
  const qs = sp.toString()
  return apiFetch<ManagedUserList>(`/api/users${qs ? `?${qs}` : ''}`)
}

export function getUser(id: string) {
  return apiFetch<ManagedUser>(`/api/users/${id}`)
}

export function createUser(input: UserCreateInput) {
  return apiFetch<ManagedUser>('/api/users', { method: 'POST', body: input })
}

export function updateUser(id: string, input: UserUpdateInput) {
  return apiFetch<ManagedUser>(`/api/users/${id}`, { method: 'PATCH', body: input })
}

export function deleteUser(id: string) {
  return apiFetch<void>(`/api/users/${id}`, { method: 'DELETE' })
}

export function setUserPassword(id: string, password: string) {
  return apiFetch<void>(`/api/users/${id}/password`, {
    method: 'POST',
    body: { password },
  })
}
