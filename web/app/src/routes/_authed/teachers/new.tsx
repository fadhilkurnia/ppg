import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { createTeacher } from '@/api/teachers'
import { ME_QUERY_KEY } from '@/lib/auth'
import { TeacherForm } from '@/components/TeacherForm'

export const Route = createFileRoute('/_authed/teachers/new')({
  beforeLoad: ({ context }) => {
    const user = context.queryClient.getQueryData<{ role: string } | null>(ME_QUERY_KEY)
    if (user?.role !== 'admin') {
      throw redirect({ to: '/teachers' })
    }
  },
  component: NewTeacherPage,
})

function NewTeacherPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const mutation = useMutation({
    mutationFn: createTeacher,
    onSuccess: async (created) => {
      await qc.invalidateQueries({ queryKey: ['teachers'] })
      await navigate({ to: '/teachers/$id', params: { id: created.id } })
    },
  })

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Tambah Pengajar</h1>
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <TeacherForm
          submitLabel="Simpan"
          pending={mutation.isPending}
          error={mutation.error}
          onSubmit={(input) => mutation.mutate(input)}
          onCancel={() => void navigate({ to: '/teachers' })}
        />
      </div>
    </div>
  )
}
