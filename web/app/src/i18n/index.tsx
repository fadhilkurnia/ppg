import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { dictionaries, type Dict, type Lang, LANGS } from './dictionary'

const STORAGE_KEY = 'ppg.lang'

type Ctx = {
  lang: Lang
  setLang: (l: Lang) => void
  t: (path: TKey, vars?: Record<string, string | number>) => string
}

const LanguageContext = createContext<Ctx | null>(null)

type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string
    ? P extends ''
      ? K
      : `${P}.${K}`
    : Leaves<T[K], P extends '' ? K : `${P}.${K}`>
}[keyof T & string]

export type TKey = Leaves<Dict>

function detectInitial(): Lang {
  if (typeof window === 'undefined') return 'id'
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === 'id' || stored === 'en') return stored
  } catch {
    // ignore
  }
  const nav = window.navigator?.language?.toLowerCase() ?? ''
  if (nav.startsWith('en')) return 'en'
  return 'id'
}

function resolve(dict: Dict, path: string): string {
  const parts = path.split('.')
  let cur: unknown = dict
  for (const p of parts) {
    if (cur && typeof cur === 'object' && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p]
    } else {
      return path
    }
  }
  return typeof cur === 'string' ? cur : path
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) =>
    Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : `{{${k}}}`,
  )
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => detectInitial())

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, lang)
    } catch {
      // ignore
    }
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang
    }
  }, [lang])

  const setLang = useCallback((l: Lang) => setLangState(l), [])

  const t = useCallback<Ctx['t']>(
    (path, vars) => interpolate(resolve(dictionaries[lang], path), vars),
    [lang],
  )

  const value = useMemo<Ctx>(() => ({ lang, setLang, t }), [lang, setLang, t])
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useTranslation() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useTranslation must be used within LanguageProvider')
  return ctx
}

export { LANGS }
export type { Lang }
