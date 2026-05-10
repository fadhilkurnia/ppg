import { createFileRoute } from '@tanstack/react-router'
import { UnderDevelopment } from '@/components/UnderDevelopment'

export const Route = createFileRoute('/_authed/attendance')({
  component: AttendancePage,
})

function AttendancePage() {
  return <UnderDevelopment title="Kehadiran" />
}
