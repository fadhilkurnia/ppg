export type Role = 'admin' | 'staff' | 'guru' | 'murid' | 'teacher' | 'student' | 'coordinator' | 'parent'

export type User = {
  id: string
  email: string
  username?: string
  nickname?: string
  phone?: string
  daerah?: string
  desa?: string
  kelompok?: string
  name: string
  role: Role
  status?: string
  mustChangePassword?: boolean
  must_change_password?: boolean
  google_id?: string
  googleId?: string
  createdAt: string
  updatedAt: string
}

export type UserList = {
  items: User[]
  total: number
}

export type CreateUserInput = {
  email: string
  username?: string
  nickname?: string
  phone?: string
  password: string
  name: string
  roleId: string
}

export type UpdateUserInput = {
  name?: string
  nickname?: string
  email?: string
  username?: string
  phone?: string
  daerah?: string
  desa?: string
  kelompok?: string
  role?: string
  status?: string
}

export type RoleRecord = {
  id: string
  label: string
  canLogin: boolean
  manageableRoleIds: string[]
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export type UserPhone = {
  id: string
  userId: string
  phone: string
  isPrimary: boolean
  verifiedAt: string
  createdAt: string
}

export type ForgotPasswordRequestResponse = {
  ok: boolean
  resetToken: string
  maskedPhone: string
  expiresAt: string
}

export type ResetPasswordWithOTPInput = {
  resetToken: string
  otp: string
  newPassword: string
  confirmPassword?: string
}

export type WAResetChallengeResponse = {
  code: string
  pollToken: string
  waLink: string
  messageText: string
  botPhone: string
  expiresAt: string
}

export type WAResetStatusResponse = {
  status: 'pending' | 'otp_sent' | 'verified' | 'consumed' | 'expired'
  phoneMasked?: string
  userName?: string
}

export type VerifyResetWAOTPResponse = {
  ok: boolean
  resetSessionToken: string
  user: User
}

export type CompleteResetWAPasswordInput = {
  resetSessionToken: string
  newPassword: string
  confirmPassword?: string
}

export type GoogleConfigResponse = {
  enabled: boolean
  clientId: string
}

// AuthMe is the server response shape for /api/auth/login and /api/auth/me.
// It extends User with the API base for the current session (either the
// canonical "/api" or a dynamic per-session prefix like "/a3f8d2").
export type AuthMe = User & {
  apiBase: string
}

export const STUDENT_LEVELS = ['Caberawit', 'Pra Remaja', 'Remaja', 'Pra Nikah'] as const
export type StudentLevel = (typeof STUDENT_LEVELS)[number]

export const STUDENT_KELOMPOKS = ['California', 'Chicago', 'New Hampshire', 'Canada', 'Other'] as const
export type StudentKelompok = (typeof STUDENT_KELOMPOKS)[number]

export type StudentStatus = 'active' | 'left'

export type Student = {
  id: string
  name: string
  nickname?: string
  dateOfBirth?: string
  gender: 'male' | 'female'
  level: StudentLevel
  kelompok: StudentKelompok
  city?: string
  joinedAt?: string
  leftAt?: string
  leaveReason?: string
  status: StudentStatus
  parentName?: string
  parentPhone?: string
  parentEmail?: string
  createdAt: string
  updatedAt: string
}

export type StudentList = {
  items: Student[]
  total: number
}

export type StudentInput = {
  name: string
  nickname?: string
  dateOfBirth?: string
  gender: 'male' | 'female'
  level: StudentLevel
  kelompok: StudentKelompok
  city?: string
  joinedAt?: string
  leftAt?: string
  leaveReason?: string
  status: StudentStatus
  parentName?: string
  parentPhone?: string
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

export const ATTENDANCE_STATUSES = ['hadir', 'izin_murid', 'izin_guru', 'by_vn'] as const
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number]

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  hadir: 'Hadir',
  izin_murid: 'Izin (Murid)',
  izin_guru: 'Izin (Guru)',
  by_vn: 'Via Voice Note',
}

export type Attendance = {
  id: string
  date: string
  durationMin?: number
  teacherId: string
  teacherName: string
  studentId: string
  studentName: string
  status: AttendanceStatus
  materi?: string
  submittedPhone?: string
  createdAt: string
  updatedAt: string
}

export type AttendanceList = {
  items: Attendance[]
  total: number
}

export type AttendanceInput = {
  date: string
  durationMin?: number
  teacherId: string
  studentId: string
  status: AttendanceStatus
  materi?: string
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

export type StudentTeacher = {
  id: string
  studentId: string
  teacherId: string
  notes?: string
  createdAt: string
  updatedAt: string
}

export type StudentTeacherDetail = {
  id: string
  studentId: string
  studentName: string
  studentNickname?: string
  studentLevel: string
  studentKelompok: string
  studentStatus: string
  teacherId: string
  teacherName: string
  teacherNickname?: string
  teacherKelompok: string
  teacherStatus: string
  notes?: string
  createdAt: string
  updatedAt: string
}

