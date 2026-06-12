import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Search } from 'lucide-react'

import { ASMAUL_HUSNA } from '@/lib/pustakaData'
import { LibraryShell } from '@/components/LibraryShell'

/**
 * PustakaAsmaul — 99 Asmaul Husna grid with search. Data is static and ships
 * with the SPA bundle.
 */
export function PustakaAsmaulPage() {
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  const list = useMemo(() => {
    const lq = q.trim().toLowerCase()
    if (!lq) return ASMAUL_HUSNA
    return ASMAUL_HUSNA.filter(
      (a) =>
        String(a.no) === lq ||
        a.latin.toLowerCase().includes(lq) ||
        a.arti.toLowerCase().includes(lq) ||
        a.artiEn.toLowerCase().includes(lq) ||
        a.arab.includes(q),
    )
  }, [q])

  return (
    <LibraryShell backTo="/pustaka" bgClassName="bg-slate-50" contentClassName="px-4 pt-14 pb-6 md:px-8">
      <div className="mx-auto max-w-5xl">
      <h1 className="mb-1 text-lg font-semibold">{t('pustaka.asmaul.title')}</h1>
      <p className="mb-4 text-sm text-slate-500">{t('pustaka.asmaul.subtitle')}</p>
      <div className="mb-4 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
        <Search size={16} className="text-slate-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('pustaka.asmaul.searchPh')}
          className="flex-1 bg-transparent text-sm focus:outline-none"
        />
        {q ? (
          <button
            type="button"
            onClick={() => setQ('')}
            className="text-xs text-slate-400 hover:text-slate-600"
          >
            {t('pustaka.asmaul.clear')}
          </button>
        ) : null}
      </div>

      <p className="mb-3 text-xs text-slate-500">{t('pustaka.asmaul.countOf', { count: list.length })}</p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((a) => (
          <div
            key={a.no}
            className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md"
          >
            <div className="flex items-start justify-between">
              <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-700">
                {a.no}
              </span>
              <div
                lang="ar"
                dir="rtl"
                className="font-arab text-right text-3xl leading-snug text-slate-900"
              >
                {a.arab}
              </div>
            </div>
            <div className="mt-2 text-base font-semibold italic text-slate-700">{a.latin}</div>
            <div className="text-sm text-slate-600">{a.arti}</div>
            <div className="mt-1 text-xs text-slate-400">{a.artiEn}</div>
          </div>
        ))}
        {list.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-8 text-center text-sm text-slate-500 sm:col-span-2 lg:col-span-3">
            {t('pustaka.asmaul.noMatch', { q })}
          </p>
        ) : null}
      </div>
      </div>
    </LibraryShell>
  )
}
