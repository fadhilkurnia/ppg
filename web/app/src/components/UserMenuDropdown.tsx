import { useState, useRef, useEffect } from 'react'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import {
  ChevronDown,
  ChevronUp,
  Globe,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Moon,
  Sun,
  User as UserIcon,
} from 'lucide-react'

import { logout } from '@/api/auth'
import type { User } from '@/api/types'
import { useSetMe } from '@/lib/auth'
import { useTranslation } from '@/lib/i18n'
import { useTheme } from '@/lib/theme'
import { Avatar } from '@/components/Avatar'
import { ProfileModal } from '@/components/ProfileModal'
import { cn } from '@/lib/cn'

type Props = {
  user: User | null | undefined
  placement?: 'bottom' | 'top'
}

export function UserMenuDropdown({ user, placement = 'bottom' }: Props) {
  const [open, setOpen] = useState(false)
  const [isRendered, setIsRendered] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const { t, lang, setLang } = useTranslation()
  const { theme, setTheme } = useTheme()
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (s) => s?.location?.pathname || '' }) || ''
  const isPortalGuru = (pathname || '').startsWith('/portal-guru')
  const setMe = useSetMe()

  const handleClose = () => {
    if (isClosing || !open) return
    setIsClosing(true)
    setTimeout(() => {
      setOpen(false)
      setIsClosing(false)
      setIsRendered(false)
    }, 120)
  }

  const handleToggle = () => {
    if (open) {
      handleClose()
    } else {
      setIsRendered(true)
      setOpen(true)
      setIsClosing(false)
    }
  }

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        handleClose()
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open, isClosing])

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: async () => {
      setMe(null)
      await navigate({ to: '/login' })
    },
  })

  if (!user) return null

  return (
    <div className="relative" ref={menuRef}>
      {placement === 'bottom' ? (
        // Desktop sidebar trigger
        <button
          type="button"
          onClick={handleToggle}
          className={cn(
            'flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors',
            'hover:bg-slate-100 dark:hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400',
            open && 'bg-slate-100 dark:bg-slate-800',
          )}
          aria-haspopup="true"
          aria-expanded={open}
        >
          <Avatar name={user.name || 'User'} className="h-9 w-9 text-xs" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
              {user.name}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <span className="truncate">{user.email || user.username}</span>
              <span>·</span>
              <span className="capitalize text-teal-600 dark:text-teal-400 font-medium">
                {user.role}
              </span>
            </div>
          </div>
          <div className="text-slate-400">
            {open ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </div>
        </button>
      ) : (
        // Mobile header trigger
        <button
          type="button"
          onClick={handleToggle}
          className="flex items-center gap-1.5 rounded-full p-1 text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          aria-haspopup="true"
          aria-expanded={open}
        >
          <Avatar name={user.name || 'User'} className="h-8 w-8 text-xs" />
          <ChevronDown size={14} className="text-slate-400 mr-0.5" />
        </button>
      )}

      {isRendered && (
        <div
          className={cn(
            'absolute z-[70] w-64 rounded-xl border border-slate-200 bg-white py-2 shadow-xl dark:border-slate-800 dark:bg-slate-900',
            placement === 'bottom'
              ? 'bottom-full left-0 mb-2 origin-bottom-left'
              : 'right-0 top-full mt-2 origin-top-right',
            isClosing ? 'animate-dropdown-out pointer-events-none' : 'animate-dropdown-in',
          )}
        >
          {/* User info preview in dropdown */}
          <div className="border-b border-slate-100 px-4 py-2.5 dark:border-slate-800">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
              {t('profile.myProfile')}
            </p>
            <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100 mt-0.5">
              {user.name}
            </p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
              {user.email || user.username}
            </p>
          </div>

          {/* Switch Mode: Portal Guru <-> Dashboard Admin (Admin only) */}
          {user.role === 'admin' && (
            <div className="p-1">
              {isPortalGuru ? (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    setIsRendered(false)
                    setIsClosing(false)
                    navigate({ to: '/dashboard' })
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-950/50 dark:hover:bg-emerald-900/50 transition-colors"
                >
                  <LayoutDashboard size={16} className="text-emerald-600 dark:text-emerald-400" />
                  <span>Dashboard Admin</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    setIsRendered(false)
                    setIsClosing(false)
                    navigate({ to: '/portal-guru' })
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-950/50 dark:hover:bg-emerald-900/50 transition-colors"
                >
                  <GraduationCap size={16} className="text-emerald-600 dark:text-emerald-400" />
                  <span>Portal Guru</span>
                </button>
              )}
            </div>
          )}

          {/* Edit Profile Action */}
          <div className="p-1">
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                setIsRendered(false)
                setIsClosing(false)
                setProfileOpen(true)
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <UserIcon size={16} className="text-slate-400" />
              <span>{t('profile.editProfile')}</span>
            </button>
          </div>

          <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

          {/* Quick Toggle Controls: Language & Theme */}
          <div className="p-1 space-y-0.5">
            {/* 1-Button Language Toggle */}
            <button
              type="button"
              onClick={() => setLang(lang === 'id' ? 'en' : 'id')}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800 transition-colors"
              title={lang === 'id' ? 'Switch to English' : 'Ganti ke Bahasa Indonesia'}
            >
              <div className="flex items-center gap-2.5">
                <Globe size={16} className="text-slate-400" />
                <span>{t('language.label')}</span>
              </div>
              <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {lang.toUpperCase()}
              </span>
            </button>

            {/* 1-Button Theme Toggle */}
            <button
              type="button"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800 transition-colors"
              title={theme === 'dark' ? t('profile.themeLight') : t('profile.themeDark')}
            >
              <div className="flex items-center gap-2.5">
                {theme === 'dark' ? (
                  <Moon size={16} className="text-indigo-400" />
                ) : (
                  <Sun size={16} className="text-amber-500" />
                )}
                <span>{t('profile.theme')}</span>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {theme === 'dark' ? (
                  <>
                    <Moon size={12} className="text-indigo-400" />
                    <span>Dark</span>
                  </>
                ) : (
                  <>
                    <Sun size={12} className="text-amber-500" />
                    <span>Light</span>
                  </>
                )}
              </span>
            </button>
          </div>

          <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

          {/* Logout */}
          <div className="p-1">
            <button
              type="button"
              disabled={logoutMutation.isPending}
              onClick={() => logoutMutation.mutate()}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
            >
              <LogOut size={16} />
              <span>{logoutMutation.isPending ? t('common.loading') : t('nav.logout')}</span>
            </button>
          </div>
        </div>
      )}

      <ProfileModal
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        user={user}
      />
    </div>
  )
}
