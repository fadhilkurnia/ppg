import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Users } from 'lucide-react'

import { listStudents } from '@/api/students'

export const Route = createFileRoute('/_authed/dashboard')({
  component: DashboardPage,
})

function DashboardPage() {
  const { data, isPending } = useQuery({
    queryKey: ['students', 'count'],
    queryFn: () => listStudents({ limit: 1 }),
  })

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Dasbor</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card icon={<Users />} label="Siswa" value={isPending ? '—' : String(data?.total ?? 0)} />
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
