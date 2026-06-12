import { NavLink, Outlet } from 'react-router-dom'
import { BookOpen, Layers } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'

export function KurikulumLayout() {
  const { t } = useTranslation()
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-shrink-0 flex-wrap gap-2 border-b border-slate-200 px-4 pt-4 md:px-6 md:pt-4">
        <SubTab to="/pengaturan/kurikulum/materi" icon={<BookOpen size={16} />} label={t('pengaturan.kurikulumTabs.materi')} />
        <SubTab to="/pengaturan/kurikulum/tingkat" icon={<Layers size={16} />} label={t('pengaturan.kurikulumTabs.tingkat')} />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <Outlet />
      </div>
    </div>
  )
}

function SubTab({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2 rounded-t-md px-3 py-1.5 text-sm font-medium transition',
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
