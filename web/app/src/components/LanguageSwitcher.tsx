import { Languages } from 'lucide-react'

import { LANGUAGES, useTranslation } from '@/lib/i18n'
import { cn } from '@/lib/cn'

type Props = {
  variant?: 'pill' | 'compact'
  className?: string
}

export function LanguageSwitcher({ variant = 'pill', className }: Props) {
  const { lang, setLang, t } = useTranslation()

  if (variant === 'compact') {
    const other = LANGUAGES.find((l) => l.code !== lang) ?? LANGUAGES[0]
    return (
      <button
        type="button"
        onClick={() => setLang(other.code)}
        title={t('language.switchTo', { lang: other.label })}
        aria-label={t('language.switchTo', { lang: other.label })}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700',
          className,
        )}
      >
        <Languages size={14} />
        {LANGUAGES.find((l) => l.code === lang)?.short ?? lang.toUpperCase()}
      </button>
    )
  }

  return (
    <div
      role="group"
      aria-label={t('language.label')}
      className={cn(
        'inline-flex items-center rounded-md border border-slate-300 bg-white p-0.5 text-xs shadow-sm dark:border-slate-700 dark:bg-slate-800',
        className,
      )}
    >
      {LANGUAGES.map((l) => {
        const active = l.code === lang
        return (
          <button
            key={l.code}
            type="button"
            onClick={() => setLang(l.code)}
            aria-pressed={active}
            title={l.label}
            className={cn(
              'rounded px-2 py-1 font-medium transition',
              active
                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100',
            )}
          >
            {l.short}
          </button>
        )
      })}
    </div>
  )
}
