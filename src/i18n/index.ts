import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './en'
import ckb from './ckb'
import kmr from './kmr'
import ar from './ar'

let savedLang = localStorage.getItem('language') || 'en'
if (savedLang === 'ku') savedLang = 'ckb'
if (!['en', 'ckb', 'kmr', 'ar'].includes(savedLang)) savedLang = 'en'

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ckb: { translation: ckb },
    kmr: { translation: kmr },
    ar: { translation: ar },
  },
  lng: savedLang,
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
})

export const LANGUAGES = [
  { code: 'en', name: 'English', dir: 'ltr' },
  { code: 'ckb', name: 'کوردی (سۆرانی)', dir: 'rtl' },
  { code: 'kmr', name: 'کوردی (بەهدینی)', dir: 'rtl' },
  { code: 'ar', name: 'العربية', dir: 'rtl' },
] as const

export const RTL_LANGUAGES = ['ckb', 'kmr', 'ar']

export function changeLanguage(code: string) {
  i18n.changeLanguage(code)
  localStorage.setItem('language', code)
}

export default i18n
