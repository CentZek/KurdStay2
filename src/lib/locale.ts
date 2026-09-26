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
  // A stay date is a local calendar day, not UTC midnight (which shifts a day
  // backwards for guests west of UTC).
  const d = typeof date === 'string' ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T00:00:00` : date) : date
  if (isNaN(d.getTime())) return String(date)
  return d.toLocaleDateString(currentLocale(), options)
}
