import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './en'

const LANGUAGE_CODES = ['en', 'ckb', 'kmr', 'ar'] as const
type LanguageCode = typeof LANGUAGE_CODES[number]

function normalizeLanguage(code: string | null): LanguageCode {
  if (code === 'ku') return 'ckb'
  return LANGUAGE_CODES.includes(code as LanguageCode) ? code as LanguageCode : 'en'
}

const savedLang = normalizeLanguage(localStorage.getItem('language'))

i18n.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: savedLang,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

const loaders = {
  ckb: () => import('./ckb'),
  kmr: () => import('./kmr'),
  ar: () => import('./ar'),
}
const pending = new Map<LanguageCode, Promise<void>>()

export function loadLanguage(code: string): Promise<void> {
  const language = normalizeLanguage(code)
  if (language === 'en' || i18n.hasResourceBundle(language, 'translation')) return Promise.resolve()
  const existing = pending.get(language)
  if (existing) return existing
  const request = loaders[language]().then(module => {
    i18n.addResourceBundle(language, 'translation', module.default, true, true)
  }).finally(() => { pending.delete(language) })
  pending.set(language, request)
  return request
}

export const LANGUAGES = [
  { code: 'en', name: 'English', dir: 'ltr' },
  { code: 'ckb', name: 'کوردی (سۆرانی)', dir: 'rtl' },
  { code: 'kmr', name: 'کوردی (بەهدینی)', dir: 'rtl' },
  { code: 'ar', name: 'العربية', dir: 'rtl' },
] as const

export const RTL_LANGUAGES = ['ckb', 'kmr', 'ar']

let languageRequest = 0

export async function changeLanguage(code: string) {
  const request = ++languageRequest
  const language = normalizeLanguage(code)
  localStorage.setItem('language', language)
  try { await loadLanguage(language) } catch { /* Use the English fallback until the next retry. */ }
  if (request === languageRequest) await i18n.changeLanguage(language)
}

function loadCurrentLanguage() {
  return loadLanguage(i18n.language).then(() => {
    i18n.emit('languageChanged', i18n.language)
  })
}

if (savedLang !== 'en') void loadCurrentLanguage().catch(() => {})
window.addEventListener('online', () => { void loadCurrentLanguage().catch(() => {}) })

export default i18n
