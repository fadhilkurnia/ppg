import { useEffect, useState } from 'react'
import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useNavigate,
  useRouterState,
} from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { LogOut, Users, LayoutDashboard, Menu, X } from 'lucide-react'

import { logout, me } from '@/api/auth'
import { ApiError } from '@/api/client'
import { ME_QUERY_KEY, useMe, useSetMe } from '@/lib/auth'
import { Button } from '@/components/Button'
import { cn } from '@/lib/cn'

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
  const [drawerOpen, setDrawerOpen] = useState(false)
  const closeDrawer = () => setDrawerOpen(false)

  const pathname = useRouterState({ select: (s) => s.location.pathname })
  useEffect(() => {
    setDrawerOpen(false)
  }, [pathname])

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: async () => {
      setMe(null)
      await navigate({ to: '/login' })
    },
  })

  return (
    <div className="min-h-screen md:flex">
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 md:hidden">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="-ml-1 rounded-md p-1.5 text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          aria-label="Buka menu"
        >
          <Menu size={20} />
        </button>
        <Link to="/dashboard" className="text-base font-semibold">
          PPG Dashboard
        </Link>
      </header>

      {drawerOpen ? (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 md:hidden"
          onClick={closeDrawer}
          aria-hidden="true"
        />
      ) : null}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform duration-200',
          drawerOpen ? 'translate-x-0' : '-translate-x-full',
          'md:static md:w-60 md:translate-x-0',
        )}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <Link to="/dashboard" className="text-base font-semibold">
            PPG Dashboard
          </Link>
          <button
            type="button"
            onClick={closeDrawer}
            className="-mr-1 rounded-md p-1.5 text-slate-700 hover:bg-slate-100 md:hidden"
            aria-label="Tutup menu"
          >
            <X size={18} />
          </button>
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

      <main className="min-w-0 flex-1 px-4 py-5 md:px-6 md:py-6">
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
