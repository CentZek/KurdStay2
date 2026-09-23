import i18n from '../i18n'

const LOCALE_MAP: Record<string, string> = {
  en: 'en',
  ckb: 'ckb',
  kmr: 'ckb',
  ar: 'ar',
}

export function currentLocale(): string {
  return LOCALE_MAP[i18n.language] || 'en'
}

export function formatDate(date: Date | string, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return String(date)
  return d.toLocaleDateString(currentLocale(), options)
}
