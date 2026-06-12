import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft } from 'lucide-react'

import { cn } from '@/lib/cn'

/**
 * LibraryShell — full-screen wrapper for pustaka content pages.
 *
 * Unlike PageShell it does NOT render a sticky page-title header. Instead a
 * small floating back arrow sits at the top-left so the content can use the
 * full viewport. Use this for the mushaf reader, Tilawati reader, kitab
 * detail, doa list, etc.
 */
export function LibraryShell({
  backTo = '/pustaka',
  backLabel,
  bgClassName = 'bg-[#f0ece0]',
  contentClassName,
  hideBack = false,
  children,
}: {
  backTo?: string
  backLabel?: string
  bgClassName?: string
  contentClassName?: string
  hideBack?: boolean
  children: ReactNode
}) {
  const { t } = useTranslation()
  const label = backLabel ?? t('libraryShell.defaultBackLabel')
  return (
    <div className={cn('relative flex h-full min-h-0 flex-col', bgClassName)}>
      {/* Floating back button. Sticks to top-left of the viewport even when
          content scrolls. */}
      {hideBack ? null : (
        <Link
          to={backTo}
          className="absolute left-3 top-3 z-40 inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white/85 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-md backdrop-blur transition hover:bg-white"
          aria-label={t('libraryShell.backToAria', { label })}
          title={t('libraryShell.backToTitle', { label })}
        >
          <ArrowLeft size={14} /> {label}
        </Link>
      )}

      <div className={cn('flex-1 min-h-0 overflow-y-auto', contentClassName)}>
        {children}
      </div>
    </div>
  )
}
