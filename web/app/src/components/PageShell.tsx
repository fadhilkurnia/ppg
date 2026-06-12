import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * PageShell — fixed header + scrollable body. The outer page never scrolls;
 * only the body (content tile) scrolls when content overflows.
 *
 * Use this as the root of any routed page rendered inside <Layout>.
 */
export function PageShell({
  header,
  children,
  bodyClassName,
  noPadding,
}: {
  header?: ReactNode
  children: ReactNode
  bodyClassName?: string
  noPadding?: boolean
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      {header ? (
        <div className={cn('flex-shrink-0', !noPadding && 'px-4 pt-3 md:px-6 md:pt-4')}>
          {header}
        </div>
      ) : null}
      <div
        className={cn(
          'flex-1 min-h-0 overflow-y-auto',
          !noPadding && 'px-4 pb-5 pt-4 md:px-6 md:pb-6',
          bodyClassName,
        )}
      >
        {children}
      </div>
    </div>
  )
}

/**
 * PageHeader — compact page heading: title + optional one-line subtitle, plus
 * optional action buttons aligned to the right.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h1 className="truncate text-lg font-semibold leading-tight">{title}</h1>
        {subtitle ? <p className="truncate text-xs text-slate-500">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  )
}
