import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Book, BookHeart, BookOpen, Sparkles, Star } from 'lucide-react'

import { PageShell, PageHeader } from '@/components/PageShell'

/**
 * Pustaka landing — tile grid linking to sub-sections. Ported from sitrac-v3
 * Pustaka index. For GNRS we ship Asmaul Husna fully (static 99 names) and
 * Karakter Luhur (static); Qur'an / Doa / Hadits / Tilawati / Media remain
 * placeholders for future ports — clicking shows a "coming soon" page.
 */
export function PustakaPage() {
  const { t } = useTranslation()
  return (
    <PageShell
      header={
        <PageHeader
          title={t('pustaka.hub.title')}
          subtitle={t('pustaka.hub.subtitle')}
        />
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <BigCard
          to="/pustaka/asmaul-husna"
          icon={<Sparkles size={20} />}
          title={t('pustaka.hub.asmaulTitle')}
          sub={t('pustaka.hub.asmaulSub')}
          accent="bg-violet-50 text-violet-700"
        />
        <BigCard
          to="/pustaka/karakter-luhur"
          icon={<Star size={20} />}
          title={t('pustaka.hub.karakterTitle')}
          sub={t('pustaka.hub.karakterSub')}
          accent="bg-emerald-50 text-emerald-700"
        />
        <BigCard
          to="/pustaka/quran"
          icon={<BookOpen size={20} />}
          title={t('pustaka.hub.quranTitle')}
          sub={t('pustaka.hub.quranSub')}
          accent="bg-sky-50 text-sky-700"
        />
        <BigCard
          to="/pustaka/hadits-himpunan"
          icon={<Book size={20} />}
          title={t('pustaka.hub.haditsTitle')}
          sub={t('pustaka.hub.haditsSub')}
          accent="bg-rose-50 text-rose-700"
        />
        <BigCard
          to="/pustaka/doa"
          icon={<BookHeart size={20} />}
          title={t('pustaka.hub.doaTitle')}
          sub={t('pustaka.hub.doaSub')}
          accent="bg-amber-50 text-amber-700"
        />
        <BigCard
          to="/pustaka/tilawati"
          icon={<BookOpen size={20} />}
          title={t('pustaka.hub.tilawatiTitle')}
          sub={t('pustaka.hub.tilawatiSub')}
          accent="bg-orange-50 text-orange-700"
        />
      </div>
    </PageShell>
  )
}

function BigCard({
  to,
  icon,
  title,
  sub,
  accent,
  disabled,
}: {
  to: string
  icon: React.ReactNode
  title: string
  sub: string
  accent: string
  disabled?: boolean
}) {
  const inner = (
    <div
      className={
        'flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition ' +
        (disabled ? 'opacity-60' : 'hover:border-slate-300 hover:shadow-md')
      }
    >
      <div className={'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ' + accent}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-slate-900">{title}</div>
        <div className="mt-0.5 text-sm text-slate-500">{sub}</div>
      </div>
    </div>
  )
  if (disabled) return inner
  return (
    <Link to={to} className="block">
      {inner}
    </Link>
  )
}
