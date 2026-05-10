import { createFileRoute } from '@tanstack/react-router'
import { UnderDevelopment } from '@/components/UnderDevelopment'

export const Route = createFileRoute('/_authed/achievement')({
  component: AchievementPage,
})

function AchievementPage() {
  return <UnderDevelopment title="Pencapaian" />
}
