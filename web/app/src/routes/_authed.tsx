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
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <Link to="/dashboard" className="text-base font-semibold">
              PPG Dashboard
            </Link>
            <nav className="flex items-center gap-1">
              <NavLink to="/dashboard" icon={<LayoutDashboard size={16} />} label="Dashboard" />
              <NavLink to="/students" icon={<Users size={16} />} label="Students" />
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-600">
              {user?.name} <span className="text-slate-400">({user?.role})</span>
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
            >
              <LogOut size={16} className="mr-1" /> Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}

function NavLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 [&.active]:bg-slate-900 [&.active]:text-white"
      activeOptions={{ exact: false }}
    >
      {icon}
      {label}
    </Link>
  )
}
