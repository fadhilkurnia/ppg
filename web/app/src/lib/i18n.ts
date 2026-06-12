// i18n bootstrap. Two locales: `id` (Bahasa Indonesia, default and
// fallback) and `en` (English). Language is detected from
// localStorage first, then the browser, and is persisted back to
// localStorage so the choice survives reloads.
//
// All UI strings live in JSON dictionaries under `src/locales/`.
// New strings go in BOTH locale files; missing keys fall back to
// `id` so a forgotten translation degrades to the source string
// instead of showing the raw key.

import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'

import en from '../locales/en.json'
import id from '../locales/id.json'

export const SUPPORTED_LANGS = ['id', 'en'] as const
export type Lang = (typeof SUPPORTED_LANGS)[number]

export const LANG_STORAGE_KEY = 'gnrs.lang'

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      id: { translation: id },
      en: { translation: en },
    },
    fallbackLng: 'id',
    supportedLngs: SUPPORTED_LANGS as unknown as string[],
    nonExplicitSupportedLngs: true,
    // Normalize region codes ('en-US', 'en-GB') down to the base language
    // ('en') so `i18n.language` is always a supported code. Without this the
    // browser detector stores 'en-US', every `i18n.language === 'en'` check
    // (number formatting, etc.) fails, and numbers fall back to id-ID
    // formatting (e.g. "5.819" instead of "5,819").
    load: 'languageOnly',
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      lookupLocalStorage: LANG_STORAGE_KEY,
      caches: ['localStorage'],
    },
    returnNull: false,
  })

// Keep the <html lang="…"> attribute in sync so screen-readers /
// CSS `:lang(…)` selectors / printer rules pick the right locale.
function syncHtmlLang(lng: string) {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lng
  }
}
syncHtmlLang(i18n.language)
i18n.on('languageChanged', syncHtmlLang)

export default i18n
