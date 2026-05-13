import { useTranslation } from '@/i18n'
import { ATTENDANCE_STATUSES, type AttendanceStatus } from '@/api/types'

export function useAttendanceStatusLabel() {
  const { t } = useTranslation()
  return (status: AttendanceStatus | string, fallback?: string): string => {
    if ((ATTENDANCE_STATUSES as readonly string[]).includes(status)) {
      return t(`attendanceStatus.${status as AttendanceStatus}` as const)
    }
    return fallback ?? String(status)
  }
}

export function useStudentStatusLabel() {
  const { t } = useTranslation()
  return (status: 'active' | 'left'): string =>
    status === 'active' ? t('status.active') : t('status.left')
}

export function useTeacherStatusLabel() {
  const { t } = useTranslation()
  return (status: 'active' | 'retired'): string =>
    status === 'active' ? t('status.active') : t('status.retired')
}
