import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { GraduationCap, Users } from 'lucide-react'

import { listStudents } from '@/api/students'
import { listTeachers } from '@/api/teachers'

export const Route = createFileRoute('/_authed/dashboard')({
  component: DashboardPage,
})

function DashboardPage() {
  const studentsQuery = useQuery({
    queryKey: ['students', 'count'],
    queryFn: () => listStudents({ limit: 1 }),
  })
  const teachersActive = useQuery({
    queryKey: ['teachers', 'count', 'active'],
    queryFn: () => listTeachers({ limit: 1, status: 'active' }),
  })

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Dasbor</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card
          icon={<Users />}
          label="Generus"
          value={studentsQuery.isPending ? '—' : String(studentsQuery.data?.total ?? 0)}
        />
        <Card
          icon={<GraduationCap />}
          label="Guru aktif"
          value={teachersActive.isPending ? '—' : String(teachersActive.data?.total ?? 0)}
        />
      </div>
    </div>
  )
}

function Card({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3 text-slate-600">
        <span className="rounded-md bg-slate-100 p-2">{icon}</span>
        <span className="text-sm">{label}</span>
      </div>
      <p className="mt-3 text-3xl font-semibold">{value}</p>
    </div>
  )
}
