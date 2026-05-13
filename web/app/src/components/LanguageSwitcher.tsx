import { Languages } from 'lucide-react'
import { LANGS, useTranslation, type Lang } from '@/i18n'
import { cn } from '@/lib/cn'

type Variant = 'pill' | 'compact'

type Props = {
  variant?: Variant
  className?: string
}

export function LanguageSwitcher({ variant = 'pill', className }: Props) {
  const { lang, setLang, t } = useTranslation()

  if (variant === 'compact') {
    const next = LANGS.find((l) => l.code !== lang) ?? LANGS[0]
    return (
      <button
        type="button"
        onClick={() => setLang(next.code as Lang)}
        title={t('language.switchTo', { lang: next.label })}
        aria-label={t('language.switchTo', { lang: next.label })}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400',
          className,
        )}
      >
        <Languages size={14} />
        {LANGS.find((l) => l.code === lang)?.short ?? lang.toUpperCase()}
      </button>
    )
  }

  return (
    <div
      role="group"
      aria-label={t('language.label')}
      className={cn(
        'inline-flex items-center rounded-md border border-slate-300 bg-white p-0.5 text-xs shadow-sm',
        className,
      )}
    >
      {LANGS.map((l) => {
        const active = l.code === lang
        return (
          <button
            key={l.code}
            type="button"
            onClick={() => setLang(l.code as Lang)}
            aria-pressed={active}
            title={l.label}
            className={cn(
              'rounded px-2 py-1 font-medium transition',
              active
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
            )}
          >
            {l.short}
          </button>
        )
      })}
    </div>
  )
}
