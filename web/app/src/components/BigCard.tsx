import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { cn } from '@/lib/cn'

type Props = {
  to: string
  icon: ReactNode
  title: string
  sub?: string
  accent: string
}

export function BigCard({ to, icon, title, sub, accent }: Props) {
  return (
    <Link
      to={to}
      className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
    >
      <span className={cn('rounded-md p-2.5', accent)}>{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</span>
        {sub ? <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{sub}</span> : null}
      </span>
    </Link>
  )
}
