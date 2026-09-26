import i18n from '../i18n'

const LOCALE_MAP: Record<string, string> = {
  en: 'en',
  ckb: 'ckb',
  // Bahdini uses the Arabic script. Never silently format it as Sorani.
  kmr: 'ku-Arab-IQ',
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
  const locale = currentLocale()
  // Older browsers resolve ku-Arab-IQ to Latin Kurmanji and some omit ckb.
  // Use day/month/year numerals when the requested script is unavailable.
  // https://cldr.unicode.org/downloads/cldr-48 (Specific Locales)
  const resolvedLocale = new Intl.DateTimeFormat(locale).resolvedOptions().locale
  if ((i18n.language === 'kmr' && !resolvedLocale.includes('Arab')) ||
      (i18n.language === 'ckb' && !resolvedLocale.startsWith('ckb'))) {
    const numericOptions = options ? { ...options, weekday: undefined } : undefined
    if (numericOptions?.month && !['numeric', '2-digit'].includes(numericOptions.month)) numericOptions.month = 'numeric'
    if (numericOptions?.dateStyle) numericOptions.dateStyle = 'short'
    return d.toLocaleDateString('en-GB', numericOptions)
  }
  return d.toLocaleDateString(locale, options)
}
