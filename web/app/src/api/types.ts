export type Role = 'admin' | 'staff'

export type User = {
  id: string
  email: string
  username?: string
  name: string
  role: Role
  createdAt: string
  updatedAt: string
}

export type Student = {
  id: string
  studentId: string
  name: string
  dateOfBirth: string
  gender: 'male' | 'female'
  address?: string
  parentName: string
  parentPhone: string
  parentEmail?: string
  createdAt: string
  updatedAt: string
}

export type StudentList = {
  items: Student[]
  total: number
}

export type StudentInput = {
  studentId: string
  name: string
  dateOfBirth: string
  gender: 'male' | 'female'
  address?: string
  parentName: string
  parentPhone: string
  parentEmail?: string
}

export type TeacherStatus = 'active' | 'retired'

export type Teacher = {
  id: string
  name: string
  nickname?: string
  kelompok: string
  desa: string
  daerah: string
  joinedAt?: string
  retiredAt?: string
  status: TeacherStatus
  notes?: string
  createdAt: string
  updatedAt: string
}

export type TeacherList = {
  items: Teacher[]
  total: number
}

export type TeacherInput = {
  name: string
  nickname?: string
  kelompok: string
  desa: string
  daerah: string
  joinedAt?: string
  retiredAt?: string
  status: TeacherStatus
  notes?: string
}
