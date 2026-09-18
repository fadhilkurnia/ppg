import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { z } from 'zod'

import { getStudent } from '@/api/students'
import { useTranslation } from '@/lib/i18n'
import { StudentAssessmentView } from '@/components/StudentAssessmentView'

const searchSchema = z.object({
  tab: z.enum(['penilaian', 'laporan']).optional().catch('penilaian'),
})

export const Route = createFileRoute('/_authed/achievement/$studentId')({
  validateSearch: searchSchema,
  component: StudentAchievementPage,
})

function StudentAchievementPage() {
  const { studentId } = Route.useParams()
  const search = Route.useSearch()
  const tab = search.tab ?? 'penilaian'
  const { t } = useTranslation()

  const { data: student, isPending } = useQuery({
    queryKey: ['student', studentId],
    queryFn: () => getStudent(studentId),
  })

  if (isPending) {
    return <p className="py-8 text-center text-sm text-slate-500">{t('common.loading')}</p>
  }
  if (!student) {
    return <p className="py-8 text-center text-sm text-slate-500">{t('common.noDataLong')}</p>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link
          to="/achievement"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
        >
          <ArrowLeft size={16} />
          <span>{t('achievement.studentTabs.back')}</span>
        </Link>
      </div>
      <StudentAssessmentView student={student} defaultTab={tab} />
    </div>
  )
}
