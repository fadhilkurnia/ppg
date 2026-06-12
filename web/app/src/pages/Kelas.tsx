import { NavLink, Outlet } from 'react-router-dom'
import { BookOpenCheck, CalendarRange, List } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'

/**
 * KelasLayout — top-level "Kelas" page with three sub-tabs: List (per-kelas
 * accordion of sesi), Kalender (month calendar of sesi), and Rencana Ajar
 * (monthly teaching plan per kelas). Outlet is filled by the sub-routes.
 */
export function KelasLayout() {
  const { t } = useTranslation()
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-shrink-0 px-4 pt-3 md:px-6 md:pt-4">
        <div>
          <h1 className="truncate text-lg font-semibold leading-tight">{t('kelas.title')}</h1>
          <p className="truncate text-xs text-slate-500">{t('kelas.subtitle')}</p>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 border-b border-slate-200">
          <TabLink to="/kelas/list" icon={<List size={16} />} label={t('kelas.tabs.list')} />
          <TabLink to="/kelas/calendar" icon={<CalendarRange size={16} />} label={t('kelas.tabs.calendar')} />
          <TabLink to="/kelas/rencana" icon={<BookOpenCheck size={16} />} label={t('kelas.tabs.rencana')} />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <Outlet />
      </div>
    </div>
  )
}

function TabLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2 rounded-t-md px-4 py-2 text-sm font-medium transition',
          '-mb-px border-b-2',
          isActive
            ? 'border-slate-900 text-slate-900'
            : 'border-transparent text-slate-500 hover:text-slate-700',
        )
      }
    >
      {icon}
      {label}
    </NavLink>
  )
}
