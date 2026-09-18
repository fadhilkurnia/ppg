import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  createFileRoute,
  Link,
  Navigate,
  Outlet,
  redirect,
  useRouterState,
} from '@tanstack/react-router'
import {
  BookMarked,
  BookOpen,
  CalendarCheck,
  GraduationCap,
  LayoutDashboard,
  Menu,
  Settings,
  Trophy,
  Users,
  X,
} from 'lucide-react'

import { me } from '@/api/auth'
import { isAuthError } from '@/api/client'
import { ME_QUERY_KEY, useMe } from '@/lib/auth'
import { useTranslation } from '@/lib/i18n'
import { UserMenuDropdown } from '@/components/UserMenuDropdown'
import { FirstLoginModal } from '@/components/FirstLoginModal'
import { forceUnlockScroll } from '@/lib/scrollLock'
import { cn } from '@/lib/cn'

export const Route = createFileRoute('/_authed')({
  beforeLoad: async ({ context, location }) => {
    try {
      const user = await context.queryClient.fetchQuery({
        queryKey: ME_QUERY_KEY,
        queryFn: me,
      })
      if (!user) throw redirect({ to: '/login' })
      const locPath = location?.pathname || ''
      if ((user.role === 'guru' || user.role === 'teacher') && !locPath.startsWith('/portal-guru')) {
        throw redirect({ to: '/portal-guru' })
      }
    } catch (err) {
      if (isAuthError(err)) {
        throw redirect({ to: '/login' })
      }
      throw err
    }
  },
  component: AuthedLayout,
})

function AuthedLayout() {
  const { data: user } = useMe()
  const { t } = useTranslation()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const closeDrawer = () => setDrawerOpen(false)

  const pathname = useRouterState({ select: (s) => s?.location?.pathname || '' }) || ''
  useEffect(() => {
    setDrawerOpen(false)
    forceUnlockScroll()
  }, [pathname])

  const navRef = useRef<HTMLElement>(null)
  const [indicatorStyle, setIndicatorStyle] = useState<{
    top: number
    height: number
    opacity: number
  }>({ top: 0, height: 0, opacity: 0 })
  const [isReady, setIsReady] = useState(false)

  const isGuru = user?.role === 'guru' || user?.role === 'teacher'
  const isAdmin = user?.role === 'admin'
  const isMurid = user?.role === 'murid' || user?.role === 'student'
  const homePath = isGuru ? '/portal-guru' : isMurid ? '/achievement' : '/dashboard'
  const isPortalGuru = (pathname || '').startsWith('/portal-guru')

  useLayoutEffect(() => {
    if (isPortalGuru || isGuru) return
    const updateIndicator = () => {
      if (!navRef.current) return
      const activeEl = navRef.current.querySelector<HTMLElement>('a[data-active="true"]')
      if (activeEl) {
        setIndicatorStyle({
          top: activeEl.offsetTop,
          height: activeEl.offsetHeight,
          opacity: 1,
        })
        if (!isReady) {
          requestAnimationFrame(() => {
            setIsReady(true)
          })
        }
      } else {
        setIndicatorStyle((prev) => ({ ...prev, opacity: 0 }))
      }
    }

    updateIndicator()
    const raf = requestAnimationFrame(updateIndicator)
    window.addEventListener('resize', updateIndicator)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', updateIndicator)
    }
  }, [pathname, isMurid, isAdmin, isPortalGuru, isGuru])

  const showFirstLoginModal = Boolean(user && (user.mustChangePassword || user.must_change_password))

  if (isPortalGuru) {
    return (
      <div className="min-h-screen w-full bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <Outlet />
        {showFirstLoginModal && <FirstLoginModal user={user!} />}
      </div>
    )
  }

  if (isGuru) {
    return <Navigate to="/portal-guru" replace />
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 md:flex">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/95 md:hidden">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="-ml-1 rounded-md p-1.5 text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          aria-label={t('nav.openMenu')}
        >
          <Menu size={20} />
        </button>
        <Link to={homePath} className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
          <img
            src="/logo.png"
            alt="PPG US"
            className="h-7 w-7 object-contain rounded-full bg-white dark:bg-slate-800 p-0.5 shadow-xs border border-slate-200 dark:border-slate-700"
          />
          <span>{t('app.title')}</span>
        </Link>
        <div className="ml-auto">
          <UserMenuDropdown user={user} placement="top" />
        </div>
      </header>

      {drawerOpen ? (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-xs md:hidden"
          onClick={closeDrawer}
          aria-hidden="true"
        />
      ) : null}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 transition-transform duration-200',
          drawerOpen ? 'translate-x-0' : '-translate-x-full',
          'md:sticky md:top-0 md:h-screen md:w-60 md:translate-x-0',
        )}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <Link to={homePath} className="flex items-center gap-2.5 text-base font-bold text-slate-900 dark:text-slate-100">
            <img
              src="/logo.png"
              alt="PPG US"
              className="h-8 w-8 object-contain rounded-full bg-white dark:bg-slate-800 p-0.5 shadow-xs border border-slate-200 dark:border-slate-700"
            />
            <span>{t('app.title')}</span>
          </Link>
          <button
            type="button"
            onClick={closeDrawer}
            className="-mr-1 rounded-md p-1.5 text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 md:hidden"
            aria-label={t('nav.closeMenu')}
          >
            <X size={18} />
          </button>
        </div>
        <nav ref={navRef} className="relative flex-1 space-y-1 p-3 overflow-y-auto">
          {/* Smooth Sliding Selector Pill */}
          <div
            aria-hidden="true"
            className={cn(
              'pointer-events-none absolute left-3 right-3 rounded-lg bg-slate-900 shadow-xs dark:bg-slate-100',
              isReady && 'transition-all duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]',
            )}
            style={{
              top: `${indicatorStyle.top}px`,
              height: `${indicatorStyle.height}px`,
              opacity: indicatorStyle.opacity,
            }}
          />

          {isMurid ? (
            <>
              <SideLink to="/achievement" icon={<Trophy size={16} />} label={t('nav.achievement')} currentPath={pathname} />
              <SideLink to="/pustaka" icon={<BookMarked size={16} />} label={t('nav.pustaka')} currentPath={pathname} />
            </>
          ) : (
            <>
              <SideLink to="/dashboard" icon={<LayoutDashboard size={16} />} label={t('nav.dashboard')} currentPath={pathname} />
              <SideLink to="/teachers" icon={<GraduationCap size={16} />} label={t('nav.teachers')} currentPath={pathname} />
              <SideLink to="/students" icon={<Users size={16} />} label={t('nav.students')} currentPath={pathname} />
              <SideLink to="/sessions" icon={<BookOpen size={16} />} label={t('nav.sessions')} currentPath={pathname} />
              <SideLink to="/attendance" icon={<CalendarCheck size={16} />} label={t('nav.attendance')} currentPath={pathname} />
              <SideLink to="/pustaka" icon={<BookMarked size={16} />} label={t('nav.pustaka')} currentPath={pathname} />
              <SideLink to="/achievement" icon={<Trophy size={16} />} label={t('nav.achievement')} currentPath={pathname} />
              {isAdmin && (
                <SideLink to="/settings" icon={<Settings size={16} />} label={t('nav.settings')} currentPath={pathname} />
              )}
            </>
          )}
        </nav>
        <div className="border-t border-slate-200 p-3 dark:border-slate-800">
          <UserMenuDropdown user={user} placement="bottom" />
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-5 md:px-6 md:py-6">
        <Outlet />
      </main>

      {showFirstLoginModal && <FirstLoginModal user={user!} />}
    </div>
  )
}

function SideLink({
  to,
  icon,
  label,
  currentPath,
}: {
  to: string
  icon: React.ReactNode
  label: string
  currentPath: string
}) {
  const path = currentPath || ''
  const isActive = path === to || path.startsWith(to + '/')
  return (
    <Link
      to={to}
      data-active={isActive ? 'true' : undefined}
      className={cn(
        'relative z-10 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-200 select-none',
        isActive
          ? 'text-white dark:text-slate-900 font-semibold'
          : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100/70 dark:hover:bg-slate-800/60',
      )}
      activeOptions={{ exact: false }}
    >
      <span className={cn('shrink-0 transition-transform duration-200', isActive && 'scale-105')}>
        {icon}
      </span>
      <span className="truncate">{label}</span>
    </Link>
  )
}
