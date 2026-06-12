import { NavLink, Outlet } from 'react-router-dom'
import { Building2, CalendarRange, GraduationCap, MapPin, MessageCircle, ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'

export function SettingsLayout() {
  const { t } = useTranslation()
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-shrink-0 space-y-3 px-4 pt-3 md:px-6 md:pt-4">
        <div>
          <h1 className="truncate text-lg font-semibold leading-tight">{t('pengaturan.title')}</h1>
          <p className="truncate text-xs text-slate-500">{t('pengaturan.subtitle')}</p>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-slate-200">
          <TabLink to="/pengaturan/instansi" icon={<Building2 size={16} />} label={t('pengaturan.tabs.instansi')} />
          <TabLink to="/pengaturan/pengguna" icon={<ShieldCheck size={16} />} label={t('pengaturan.tabs.pengguna')} />
          <TabLink to="/pengaturan/kurikulum" icon={<GraduationCap size={16} />} label={t('pengaturan.tabs.kurikulum')} />
          <TabLink
            to="/pengaturan/tahun-ajaran"
            icon={<CalendarRange size={16} />}
            label={t('pengaturan.tabs.tahunAjaran')}
          />
          <TabLink
            to="/pengaturan/whatsapp"
            icon={<MessageCircle size={16} />}
            label={t('pengaturan.tabs.whatsapp')}
          />
          <TabLink to="/pengaturan/wilayah" icon={<MapPin size={16} />} label={t('pengaturan.tabs.wilayah')} />
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
      title={label}
      aria-label={label}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2 rounded-t-md px-3 py-2 text-sm font-medium transition sm:px-4',
          '-mb-px border-b-2',
          isActive
            ? 'border-slate-900 text-slate-900'
            : 'border-transparent text-slate-500 hover:text-slate-700',
        )
      }
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </NavLink>
  )
}
