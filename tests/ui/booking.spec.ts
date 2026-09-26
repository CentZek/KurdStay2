import { test, expect, Page } from '@playwright/test'
import en from '../../src/i18n/en'
import ar from '../../src/i18n/ar'
import ckb from '../../src/i18n/ckb'
import kmr from '../../src/i18n/kmr'

const hotelId = '10000000-0000-0000-0000-000000000001'
const roomId = '20000000-0000-0000-0000-000000000001'
const bookingId = '30000000-0000-0000-0000-000000000001'
const path = `/booking/${hotelId}/${roomId}?checkIn=2030-10-10&checkOut=2030-10-12&guests=2`

async function mockApi(page: Page, options: { unavailable?: boolean; failOnce?: boolean; status?: string } = {}) {
  const submissions: any[] = []
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  // Third-party font/CDN outages must not determine application test results.
  await page.route(/^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|images\.pexels\.com)\//, route => route.abort())
  await page.route('https://booking.test/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    let data: any = []
    if (url.pathname.endsWith('/hotels')) data = { id: hotelId, name: 'Mountain View Retreat', city: 'Erbil', currency: 'USD', profit_margin_percentage: 10 }
    if (url.pathname.endsWith('/room_types')) data = { id: roomId, name: 'Deluxe Double Room', base_price: 100, max_guests: 2 }
    if (url.pathname.endsWith('/get_booking_quote')) {
      if (options.unavailable) return route.fulfill({ status: 400, json: { message: 'ROOM_UNAVAILABLE' } })
      const body = request.postDataJSON()
      data = { nights: 2, finalPriceTotal: 275 * body.p_rooms, availableRooms: 3 }
    }
    if (url.pathname.endsWith('/create_booking')) {
      submissions.push(request.postDataJSON())
      if (options.failOnce && submissions.length === 1) return route.fulfill({ status: 503, json: { message: 'Temporary failure' } })
      data = bookingId
    }
    if (url.pathname.endsWith('/bookings')) data = { id: bookingId, customer_name: 'Test Guest', check_in_date: '2030-10-10', check_out_date: '2030-10-12',
      guests: 2, rooms: 1, final_price_total: 275, status: options.status || 'pending', hotels: { name: 'Mountain View Retreat', currency: 'USD' }, room_types: { name: 'Deluxe Double Room' } }
    if (url.pathname.endsWith('/current_profile')) data = null
    await route.fulfill({ json: data })
  })
  return { submissions, errors }
}

test('checkout shows server total, supports multiple rooms and submits one request', async ({ page }) => {
  const { submissions, errors } = await mockApi(page)
  await page.goto(path, { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('$275', { exact: true })).toBeVisible()
  await page.getByLabel('Rooms', { exact: true }).selectOption('2')
  await page.getByLabel('Guests', { exact: true }).selectOption('4')
  await expect(page.getByText('$550', { exact: true })).toBeVisible()
  await page.getByLabel('Name', { exact: false }).fill('Test Guest')
  await page.getByLabel('Email', { exact: false }).fill('test@example.test')
  await page.getByRole('button', { name: 'Request booking', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/booking/confirmation/${bookingId}`))
  await expect(page.getByText('Pending', { exact: true })).toBeVisible()
  expect(submissions).toHaveLength(1)
  expect(submissions[0].p_expected_total).toBe(550)
  expect(submissions[0].p_guests).toBe(4)
  expect(errors).toEqual([])
})

test('sold-out dates show a useful message and disable submission', async ({ page }) => {
  await mockApi(page, { unavailable: true })
  await page.goto(path, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('alert')).toContainText('not available for every night')
  await expect(page.getByRole('button', { name: 'Request booking', exact: true })).toBeDisabled()
})

test('failed submission keeps guest input and reuses its idempotency key', async ({ page }) => {
  const { submissions } = await mockApi(page, { failOnce: true })
  await page.goto(path, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('button', { name: 'Request booking', exact: true })).toBeEnabled()
  await page.getByLabel('Name', { exact: false }).fill('Test Guest')
  await page.getByLabel('Email', { exact: false }).fill('test@example.test')
  await page.getByRole('button', { name: 'Request booking', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByLabel('Name', { exact: false })).toHaveValue('Test Guest')
  await expect(page.getByRole('button', { name: 'Request booking', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Request booking', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/booking/confirmation/${bookingId}`))
  expect(submissions).toHaveLength(2)
  expect(submissions[1].p_request_id).toBe(submissions[0].p_request_id)
})

test('confirmation uses the real status, including cancellations', async ({ page }) => {
  await mockApi(page, { status: 'cancelled' })
  await page.goto(`/booking/confirmation/${bookingId}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Cancelled', exact: true })).toBeVisible()
  await expect(page.getByText('Pending', { exact: true })).toHaveCount(0)
})

test('reload recovers a successful request even when the last room is now sold out', async ({ page }) => {
  const { submissions } = await mockApi(page, { unavailable: true })
  await page.addInitScript(({ hotelId, roomId }) => {
    sessionStorage.setItem('kurdstay_booking_request', JSON.stringify({
      id: '40000000-0000-0000-0000-000000000001',
      payload: JSON.stringify({ p_hotel_id: hotelId, p_room_type_id: roomId }),
    }))
  }, { hotelId, roomId })
  await page.goto(path, { waitUntil: 'domcontentloaded' })
  await expect(page).toHaveURL(new RegExp(`/booking/confirmation/${bookingId}`))
  expect(submissions).toHaveLength(0)
})

test('invalid dates in a shared link cannot enable booking or crash checkout', async ({ page }) => {
  const { errors } = await mockApi(page)
  await page.goto(`/booking/${hotelId}/${roomId}?checkIn=invalid&checkOut=2030-02-30`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByLabel('Check-in', { exact: true })).toHaveValue('')
  await expect(page.getByLabel('Check-out', { exact: true })).toHaveValue('')
  await expect(page.getByRole('button', { name: 'Request booking', exact: true })).toBeDisabled()
  expect(errors).toEqual([])
})

test('a forged local profile cannot open the admin workspace', async ({ page }) => {
  await mockApi(page)
  await page.addInitScript(() => localStorage.setItem('stayhub_user', JSON.stringify({ id: 'fake', role: 'admin' })))
  await page.goto('/admin', { waitUntil: 'domcontentloaded' })
  await expect(page).toHaveURL(/\/login$/)
})

for (const language of ['en', 'ar', 'ckb', 'kmr']) {
  test(`mobile checkout is readable without horizontal overflow (${language})`, async ({ page }) => {
    const { errors } = await mockApi(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.addInitScript(language => localStorage.setItem('language', language), language)
    await page.goto(path, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('$275', { exact: true })).toBeVisible()
    const translations = { en, ar, ckb, kmr }[language]!
    await expect(page.locator('html')).toHaveAttribute('dir', language === 'en' ? 'ltr' : 'rtl')
    await expect(page.locator('html')).toHaveAttribute('lang', language === 'kmr' ? 'kmr-Arab-IQ' : language)
    await expect(page.getByLabel(translations.common.checkIn, { exact: true })).toHaveValue('2030-10-10')
    await expect(page.getByRole('button', { name: translations.booking.requestBooking, exact: true })).toBeEnabled()
    await expect(page.locator('#booking-email')).toHaveCSS('direction', 'ltr')
    await expect(page.locator('#booking-phone')).toHaveCSS('direction', 'ltr')
    expect(await page.locator('main').innerText()).not.toContain('???')
    if (language === 'ckb' || language === 'kmr') {
      expect(await page.locator('main').innerText()).not.toMatch(/Oct|October/)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: `tmp/checkout-${language}.png`, fullPage: true })
    expect(errors).toEqual([])
  })
}

for (const language of ['ar', 'ckb', 'kmr'] as const) {
  test(`registration accepts local phone and verification digits (${language})`, async ({ page }) => {
    const translations = { ar, ckb, kmr }[language]
    const { errors } = await mockApi(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.addInitScript(language => localStorage.setItem('language', language), language)
    const registrations: any[] = []
    const verifications: any[] = []
    await page.route('**/rest/v1/rpc/register_user', async route => {
      registrations.push(route.request().postDataJSON())
      await route.fulfill({ json: {
        success: true, session_token: 'test-session',
        user: { id: 'test-user', name: 'Test Guest', username: 'test-guest', role: 'customer', language_preference: language },
      } })
    })
    await page.route('**/functions/v1/phone-verification', async route => {
      // The deployed function rejects requests without the new registration's
      // session. This mock must enforce the same boundary.
      if (route.request().headers()['x-stay-session'] !== 'test-session') {
        await route.fulfill({ status: 401, json: { error: 'Not authenticated' } })
        return
      }
      verifications.push(route.request().postDataJSON())
      await route.fulfill({ json: { success: true } })
    })
    await page.goto('/register', { waitUntil: 'domcontentloaded' })
    await page.getByPlaceholder(translations.register.fullNamePlaceholder).fill('Test Guest')
    await page.getByPlaceholder(translations.register.usernamePlaceholder).fill('test-guest')
    await page.getByPlaceholder(translations.register.passwordPlaceholder).fill('test-password')
    await page.locator('input[type="tel"]').fill('٠٧٧٠١٢٣٤٥٦٧')
    await page.getByRole('button', { name: translations.register.continue, exact: true }).click()
    await expect(page.getByPlaceholder('000000')).toBeVisible()
    expect(registrations[0].p_phone).toBe('+9647701234567')
    expect(registrations[0].p_language).toBe(language)
    await page.getByPlaceholder('000000').fill('۱۲۳٤٥٦')
    await expect(page.getByPlaceholder('000000')).toHaveValue('123456')
    await expect(page.getByPlaceholder('000000')).toHaveCSS('direction', 'ltr')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: `tmp/register-${language}.png`, fullPage: true })
    await page.getByRole('button', { name: translations.register.confirmNumber, exact: true }).click()
    await expect.poll(() => verifications.find(request => request.action === 'verify')?.code).toBe('123456')
    expect(errors).toEqual([])
  })
}

test('Arabic guest options and language switching update immediately', async ({ page }) => {
  await mockApi(page)
  await page.route('**/rest/v1/hotels*', route => route.fulfill({ json: [] }))
  await page.addInitScript(() => localStorage.setItem('language', 'ar'))
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('option', { name: 'ضيف واحد', exact: true })).toHaveCount(1)
  await expect(page.getByRole('option', { name: 'ضيفان', exact: true })).toHaveCount(1)
  await expect(page.getByRole('option', { name: '3 ضيوف', exact: true })).toHaveCount(1)
  await page.getByRole('button', { name: ar.common.language, exact: true }).click()
  await page.getByRole('button', { name: 'English', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr')
  await expect(page.getByRole('option', { name: '2 guests', exact: true })).toHaveCount(1)
})
