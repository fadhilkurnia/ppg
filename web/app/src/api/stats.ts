import { apiFetch } from './client'

export type Bucket = { label: string; count: number }
export type LevelKelompokCell = { level: string; kelompok: string; count: number }

export type StudentStats = {
  total: number
  activeTotal: number
  byGender: Bucket[]
  byStatus: Bucket[]
  byLevel: Bucket[]
  byKelompok: Bucket[]
  matrix: LevelKelompokCell[]
}

export type TeacherStats = {
  total: number
  activeTotal: number
  byStatus: Bucket[]
  byDaerah: Bucket[]
}

export type DashboardStats = {
  students: StudentStats
  teachers: TeacherStats
}

export function getDashboardStats() {
  return apiFetch<DashboardStats>('/api/stats/dashboard')
}
