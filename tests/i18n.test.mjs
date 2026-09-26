import test from 'node:test'
import assert from 'node:assert/strict'
import i18next from 'i18next'
import { flatten, loadTs } from './helpers/load-ts.mjs'

const dictionaries = Object.fromEntries(['en', 'ckb', 'kmr', 'ar'].map(language =>
  [language, loadTs(`src/i18n/${language}.ts`).default]))
const resources = Object.fromEntries(Object.entries(dictionaries).map(([language, translation]) =>
  [language, { translation }]))
const baseKey = key => key.replace(/_(zero|one|two|few|many|other)$/, '')
const placeholders = text => [...text.matchAll(/{{\s*([^}]+?)\s*}}/g)].map(match => match[1]).filter(name => name !== 'count').sort()
const tags = text => [...text.matchAll(/<\/?\d+>/g)].map(match => match[0]).sort()
const english = flatten(dictionaries.en)
const baseEnglish = Object.fromEntries(Object.entries(english).map(([key, value]) => [baseKey(key), value]))

for (const language of ['ckb', 'kmr', 'ar']) {
  test(`${language}: complete translations preserve interpolation and rich text`, () => {
    const translations = flatten(dictionaries[language])
    assert.deepEqual([...new Set(Object.keys(translations).map(baseKey))].sort(), Object.keys(baseEnglish).sort())
    for (const [key, text] of Object.entries(translations)) {
      assert.ok(text.trim(), `${language}.${key} is empty`)
      assert.doesNotMatch(text, /\uFFFD|\?\?\?/, `${language}.${key} contains damaged text`)
      assert.deepEqual(placeholders(text), placeholders(baseEnglish[baseKey(key)]), `${language}.${key} placeholders`)
      assert.deepEqual(tags(text), tags(baseEnglish[baseKey(key)]), `${language}.${key} markup`)
    }
  })

  test(`${language}: every plural category resolves locally, never to English`, async () => {
    const instance = i18next.createInstance()
    await instance.init({ resources, lng: language, fallbackLng: 'en', interpolation: { escapeValue: false } })
    const translations = flatten(dictionaries[language])
    const pluralKeys = [...new Set(Object.keys(translations).filter(key => /_other$/.test(key)).map(baseKey))]
    for (const key of pluralKeys) {
      for (const category of new Intl.PluralRules(language).resolvedOptions().pluralCategories) {
        assert.ok(translations[`${key}_${category}`], `${language}.${key}_${category} is missing`)
      }
      for (const count of [0, 1, 2, 3, 11, 100, 101]) {
        const result = instance.t(key, { count, names: 'ROOM', returnDetails: true })
        assert.equal(result.usedLng, language, `${language}.${key} count=${count}`)
        assert.doesNotMatch(result.res, /{{|}}/)
      }
    }
  })
}

test('Arabic guest counts and elapsed times use singular, dual and plural grammar', async () => {
  const instance = i18next.createInstance()
  await instance.init({ resources, lng: 'ar' })
  for (const [count, expected] of [[1, 'ضيف واحد'], [2, 'ضيفان'], [3, '3 ضيوف'], [11, '11 ضيفاً'], [100, '100 ضيف']]) {
    assert.equal(instance.t('common.guestCount', { count }), expected)
  }
  assert.equal(instance.t('chats.minutesAgo', { count: 2 }), 'منذ دقيقتين')
  assert.equal(instance.t('chats.hoursAgo', { count: 3 }), 'منذ 3 ساعات')
})

test('Arabic and Kurdish keyboard digits remain usable in phone and verification fields', () => {
  const { normalizeDigits } = loadTs('src/lib/digits.ts')
  assert.equal(normalizeDigits('+٩٦٤ ٧٧٠ ١٢٣ ٤٥٦٧'), '+964 770 123 4567')
  assert.equal(normalizeDigits('۰۱۲۳۴۵۶۷۸۹'), '0123456789')
  assert.equal(normalizeDigits('١2۳٤5۶'), '123456')
  assert.equal(normalizeDigits('guest@example.test +964'), 'guest@example.test +964')
})

test('stay dates keep the local calendar day and Bahdini never inherits Sorani dates', () => {
  const i18n = { language: 'kmr' }
  const { formatDate, currentLocale } = loadTs('src/lib/locale.ts', { '../i18n': { default: i18n } })
  assert.equal(currentLocale(), 'ku-Arab-IQ')
  const date = formatDate('2030-10-12', { year: 'numeric', month: 'short', day: 'numeric' })
  // A browser without Arabic-script Kurmanji uses an unambiguous numeric date.
  if (!new Intl.DateTimeFormat('ku-Arab-IQ').resolvedOptions().locale.includes('Arab')) {
    assert.equal(date, '12/10/2030')
    assert.equal(formatDate('2030-10-12', { month: 'short' }), '10')
  }
  assert.equal(formatDate('invalid'), 'invalid')
  i18n.language = 'en'
  assert.equal(formatDate('2030-10-12', { year: 'numeric', month: 'short', day: 'numeric' }), 'Oct 12, 2030')
})
