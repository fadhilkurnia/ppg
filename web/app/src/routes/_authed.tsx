import { createFileRoute, Link, Outlet, redirect, useNavigate } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { LogOut, Users, LayoutDashboard } from 'lucide-react'

import { logout, me } from '@/api/auth'
import { ApiError } from '@/api/client'
import { ME_QUERY_KEY, useMe, useSetMe } from '@/lib/auth'
import { Button } from '@/components/Button'

export const Route = createFileRoute('/_authed')({
  beforeLoad: async ({ context }) => {
    try {
      const user = await context.queryClient.fetchQuery({
        queryKey: ME_QUERY_KEY,
        queryFn: me,
      })
      if (!user) throw redirect({ to: '/login' })
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        throw redirect({ to: '/login' })
      }
      throw err
    }
  },
  component: AuthedLayout,
})

function AuthedLayout() {
  const { data: user } = useMe()
  const navigate = useNavigate()
  const setMe = useSetMe()

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: async () => {
      setMe(null)
      await navigate({ to: '/login' })
    },
  })

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4">
          <Link to="/dashboard" className="text-base font-semibold">
            PPG Dashboard
          </Link>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          <SideLink to="/dashboard" icon={<LayoutDashboard size={16} />} label="Dasbor" />
          <SideLink to="/students" icon={<Users size={16} />} label="Generus" />
        </nav>
        <div className="space-y-2 border-t border-slate-200 p-3">
          <div className="px-2">
            <div className="truncate text-sm font-medium text-slate-900">{user?.name}</div>
            <div className="text-xs text-slate-500">{user?.role}</div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
          >
            <LogOut size={16} className="mr-2" /> Keluar
          </Button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-6 py-6">
        <Outlet />
      </main>
    </div>
  )
}

function SideLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 [&.active]:bg-slate-900 [&.active]:text-white"
      activeOptions={{ exact: false }}
    >
      {icon}
      {label}
    </Link>
  )
}
