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

export type AttendanceTotals = {
  sessions: number
  hours: number
  last30Days: number
  activePairs: number
}

export type MonthlyBucket = {
  month: string
  sessions: number
  hours: number
}

export type StudentAggregate = {
  studentId: string
  studentName: string
  totalSessions: number
  hadirSessions: number
  hadirRate: number
  totalHours: number
  lastDate?: string
}

export type TeacherAggregate = {
  teacherId: string
  teacherName: string
  totalSessions: number
  totalHours: number
  uniqueStudents: number
  lastDate?: string
}

export type AttendanceStats = {
  total: AttendanceTotals
  monthly: MonthlyBucket[]
  byStatus: Bucket[]
  byStudent: StudentAggregate[]
  byTeacher: TeacherAggregate[]
}

export function getAttendanceStats() {
  return apiFetch<AttendanceStats>('/api/stats/attendance')
}
