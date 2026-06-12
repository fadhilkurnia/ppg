import { useTranslation } from 'react-i18next'
import { Globe } from 'lucide-react'

export function LanguageSwitcher() {
  const { i18n } = useTranslation()
  const next = i18n.language === 'id' ? 'en' : 'id'

  return (
    <button
      type="button"
      onClick={() => i18n.changeLanguage(next)}
      className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-100"
      title={next === 'en' ? 'Switch to English' : 'Ganti ke Bahasa Indonesia'}
    >
      <Globe size={14} />
      <span className="uppercase">{next}</span>
    </button>
  )
}