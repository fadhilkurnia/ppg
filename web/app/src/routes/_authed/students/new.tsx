import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { createStudent } from '@/api/students'
import { ME_QUERY_KEY } from '@/lib/auth'
import { StudentForm } from '@/components/StudentForm'

export const Route = createFileRoute('/_authed/students/new')({
  beforeLoad: ({ context }) => {
    const user = context.queryClient.getQueryData<{ role: string } | null>(ME_QUERY_KEY)
    if (user?.role !== 'admin') {
      throw redirect({ to: '/students' })
    }
  },
  component: NewStudentPage,
})

function NewStudentPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const mutation = useMutation({
    mutationFn: createStudent,
    onSuccess: async (created) => {
      await qc.invalidateQueries({ queryKey: ['students'] })
      await navigate({ to: '/students/$id', params: { id: created.id } })
    },
  })

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">New student</h1>
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <StudentForm
          submitLabel="Create"
          pending={mutation.isPending}
          error={mutation.error}
          onSubmit={(input) => mutation.mutate(input)}
          onCancel={() => void navigate({ to: '/students' })}
        />
      </div>
    </div>
  )
}
