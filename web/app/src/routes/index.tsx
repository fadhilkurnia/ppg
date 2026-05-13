import { createFileRoute, redirect } from '@tanstack/react-router'
import { me } from '@/api/auth'
import { isAuthError } from '@/api/client'
import { ME_QUERY_KEY } from '@/lib/auth'

export const Route = createFileRoute('/')({
  beforeLoad: async ({ context }) => {
    try {
      const user = await context.queryClient.fetchQuery({
        queryKey: ME_QUERY_KEY,
        queryFn: me,
      })
      if (user) {
        throw redirect({ to: '/dashboard' })
      }
    } catch (err) {
      if (isAuthError(err)) {
        throw redirect({ to: '/login' })
      }
      throw err
    }
    throw redirect({ to: '/login' })
  },
})
