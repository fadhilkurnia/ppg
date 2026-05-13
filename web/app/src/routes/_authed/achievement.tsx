import { createFileRoute } from '@tanstack/react-router'
import { UnderDevelopment } from '@/components/UnderDevelopment'
import { useTranslation } from '@/i18n'

export const Route = createFileRoute('/_authed/achievement')({
  component: AchievementPage,
})

function AchievementPage() {
  const { t } = useTranslation()
  return <UnderDevelopment title={t('nav.achievement')} />
}
