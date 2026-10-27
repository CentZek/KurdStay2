import { test, expect, type Page } from '@playwright/test'
import en from '../../src/i18n/en'
import ar from '../../src/i18n/ar'
import ckb from '../../src/i18n/ckb'
import kmr from '../../src/i18n/kmr'

const hotel = { id: 'hotel-1', name: 'Al-Rawi Farm in Fallujah', city: 'Fallujah', country: 'Iraq',
  location: 'Mukhtariya', address: 'River road', description: 'A peaceful farm stay.', images: [], amenities: [],
  currency: 'USD', profit_margin_percentage: 10, owner_id: 'owner-1', status: 'active', property_type: 'farm' }
const owner = { id: 'owner-1', name: 'Farm Manager', username: 'manager', phone: '+9647500000000', created_at: '2026-01-01' }
const application = { id: 'app-1', property_name: 'Garden Stay', city: 'Erbil', property_type: 'farm', status: 'pending', images: [], amenities: [], applicant_name: 'Host' }

async function setup(page: Page, options: { lang?: string; failRead?: string; failWrite?: string; role?: string; slowChat?: boolean } = {}) {
  const writes: { path: string; method: string; body: any }[] = []
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await page.addInitScript(lang => { localStorage.setItem('language', lang); localStorage.setItem('kurdstay_session', 'test-session') }, options.lang || 'en')
  await page.route(/^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|images\.pexels\.com)\//, route => route.abort())
  await page.route('https://booking.test/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname.split('/').pop()!
    const write = !['GET', 'HEAD'].includes(request.method()) && !['current_profile', 'app_is_admin'].includes(path)
    if (write) writes.push({ path, method: request.method(), body: request.postDataJSON() })
    if ((!write && options.failRead === path) || (write && options.failWrite === path)) return route.fulfill({ status: 400, json: { message: 'Temporary failure' } })
    if (request.method() === 'HEAD') return route.fulfill({ status: 200, headers: { 'content-range': '0-0/1' } })
    let data: any = []
    if (path === 'current_profile') data = { id: 'admin-1', username: 'admin', name: 'Admin', role: options.role || 'admin', language_preference: options.lang || 'en' }
    if (path === 'hotels') data = write ? { id: hotel.id } : [hotel]
    if (path === 'profiles') data = [owner]
    if (path === 'destinations') data = [{ id: 'dest-1', name: 'Erbil', created_at: '2026-01-01' }]
    if (path === 'accommodation_applications') data = write ? { id: application.id } : [application]
    if (path === 'bookings') data = [{ id: 'booking-1', hotel_id: hotel.id, customer_name: 'Guest', customer_email: 'guest@example.test',
      check_in_date: '2030-10-10', check_out_date: '2030-10-12', guests: 2, rooms: 1, status: 'pending', margin_amount: 20,
      hotels: { name: hotel.name, currency: 'USD' }, room_types: { name: 'Double' } }]
    if (path === 'chat_sessions') data = ['chat-a', 'chat-b'].map((id, i) => ({ id, customer_phone: `Guest ${i + 1}`, status: 'open', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }))
    if (path === 'chat_messages' && !write) {
      const first = url.searchParams.get('session_id') === 'eq.chat-a'
      if (options.slowChat && first && url.searchParams.get('select') === '*') await new Promise(r => setTimeout(r, 600))
      data = [{ id: first ? 'msg-a' : 'msg-b', role: 'customer', content: first ? 'First conversation' : 'Second conversation', created_at: new Date().toISOString() }]
    }
    if (path === 'register_user' || path === 'update_user_credentials') data = { success: true, user: owner }
    await route.fulfill({ json: data })
  })
  return { writes, errors }
}

for (const [lang, messages] of Object.entries({ en, ar, ckb, kmr })) {
  test(`all admin pages fit a phone and render without errors (${lang})`, async ({ page }) => {
    test.setTimeout(120000)
    const state = await setup(page, { lang })
    await page.setViewportSize({ width: 390, height: 844 })
    for (const path of ['', '/hotels', '/owners', '/bookings', '/destinations', '/applications', '/chats', '/import-hotel']) {
      await page.goto('/admin' + path)
      await expect(page.locator('.dashboard-content h1')).toBeVisible()
      await expect(page.locator('.workspace-sidebar')).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), path).toBe(true)
    }
    await page.goto('/admin/hotels')
    await page.getByRole('button', { name: messages.common.edit, exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    for (const button of await dialog.locator('.hotel-editor-tab').all()) {
      await expect(button).toBeInViewport()
      const box = await button.boundingBox()
      expect(box!.height).toBeGreaterThanOrEqual(44)
      expect(await button.evaluate(el => el.scrollHeight <= el.clientHeight + 1)).toBe(true)
    }
    await dialog.getByRole('button', { name: messages.common.settings, exact: true }).click()
    await expect(dialog.getByLabel(messages.admin.marginPercentage, { exact: false })).toBeVisible()
    expect(state.errors).toEqual([])
  })
}

for (const viewport of [{ width: 1280, height: 720 }, { width: 980, height: 600 }, { width: 320, height: 568 }, { width: 844, height: 390 }]) {
  test(`hotel tabs and footer remain readable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await setup(page)
    await page.setViewportSize(viewport)
    await page.goto('/admin/hotels')
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    const dialog = page.getByRole('dialog')
    const tabs = dialog.locator('.hotel-editor-tabs')
    const bounds = await tabs.boundingBox()
    for (const button of await tabs.getByRole('button').all()) {
      const box = await button.boundingBox()
      expect(box!.y).toBeGreaterThanOrEqual(bounds!.y)
      expect(box!.y + box!.height).toBeLessThanOrEqual(bounds!.y + bounds!.height)
    }
    await dialog.locator('form').evaluate(el => { el.scrollTop = el.scrollHeight })
    await expect(tabs).toBeInViewport()
    await expect(dialog.getByRole('button', { name: 'Next', exact: true })).toBeInViewport()
    await page.screenshot({ path: `tmp/admin-hotel-${viewport.width}.png` })
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeFocused()
  })
}

test('hotel wizard validates basics and numeric settings, retains input after a failed save', async ({ page }) => {
  const state = await setup(page, { failWrite: 'hotels' })
  await page.goto('/admin/hotels')
  await page.getByRole('button', { name: en.admin.addHotel, exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(dialog.getByLabel(en.admin.hotelsForm.hotelName, { exact: false })).toBeFocused()
  await dialog.getByLabel(en.admin.hotelsForm.hotelName, { exact: false }).fill('New Farm')
  await dialog.getByLabel(en.admin.hotelsForm.city, { exact: false }).fill('Erbil')
  await dialog.getByLabel(en.admin.hotelsForm.address, { exact: false }).fill('Garden road')
  await dialog.getByRole('button', { name: 'Settings', exact: true }).click()
  await dialog.getByLabel(en.admin.marginPercentage, { exact: false }).fill('-1')
  await dialog.getByRole('button', { name: en.admin.hotelsForm.createHotel, exact: true }).click()
  expect(state.writes).toHaveLength(0)
  await dialog.getByLabel(en.admin.marginPercentage, { exact: false }).fill('10')
  await dialog.getByRole('button', { name: en.admin.hotelsForm.createHotel, exact: true }).click()
  await expect(dialog.getByRole('alert')).toBeVisible()
  await dialog.getByRole('button', { name: 'Details', exact: true }).click()
  await expect(dialog.getByLabel(en.admin.hotelsForm.hotelName, { exact: false })).toHaveValue('New Farm')
  expect(state.writes).toHaveLength(1)
  expect(state.errors).toEqual([])
})

test('hotel save succeeds and search filters the list', async ({ page }) => {
  const state = await setup(page)
  await page.goto('/admin/hotels')
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel(en.admin.hotelsForm.hotelName, { exact: false }).fill('Updated Farm')
  await dialog.getByRole('button', { name: 'Settings', exact: true }).click()
  await dialog.getByRole('button', { name: en.admin.hotelsForm.updateHotel, exact: true }).click()
  await expect(dialog).toHaveCount(0)
  expect(state.writes[0].body.name).toBe('Updated Farm')
  await page.getByRole('searchbox', { name: 'Search', exact: true }).fill('no matching farm')
  await expect(page.getByText(en.common.noResults, { exact: true })).toBeVisible()
})

for (const [path, table] of [['hotels', 'hotels'], ['owners', 'profiles'], ['destinations', 'destinations'], ['applications', 'accommodation_applications'], ['bookings', 'bookings'], ['chats', 'chat_sessions']] as const) {
  test(`${path} shows database load errors and offers retry`, async ({ page }) => {
    await setup(page, { failRead: table })
    await page.goto('/admin/' + path)
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page.getByRole('button', { name: en.ux.retry, exact: true })).toBeVisible()
  })
}

test('failed hotel deletion keeps the confirmation open', async ({ page }) => {
  await setup(page, { failWrite: 'hotels' })
  await page.goto('/admin/hotels')
  await page.getByTitle(en.admin.hotelsForm.deleteHotelTitle).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible()
})

test('failed application review preserves the note and dialog', async ({ page }) => {
  await setup(page, { failWrite: 'accommodation_applications' })
  await page.goto('/admin/applications')
  await page.getByRole('button').filter({ hasText: 'Garden Stay' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel(en.applications.noteLabel).fill('Please add bedroom photos.')
  await dialog.getByRole('button', { name: en.applications.requestInfo, exact: true }).click()
  await expect(dialog.getByRole('alert')).toBeVisible()
  await expect(dialog.getByLabel(en.applications.noteLabel)).toHaveValue('Please add bedroom photos.')
})

test('manager account creation sends the phone in the same request', async ({ page }) => {
  const state = await setup(page)
  await page.goto('/admin/owners')
  await page.getByRole('button', { name: en.admin.managers.newAccount }).click()
  const dialog = page.getByRole('dialog')
  await dialog.locator('input').nth(0).fill('New Manager')
  await dialog.locator('input').nth(1).fill('newmanager')
  await dialog.locator('input').nth(2).fill('test-only-password')
  await dialog.locator('input').nth(3).fill('+9647500000001')
  await dialog.getByRole('button', { name: en.home.createAccount, exact: true }).click()
  await expect(dialog).toHaveCount(0)
  expect(state.writes).toHaveLength(1)
  expect(state.writes[0].body.p_phone).toBe('+9647500000001')
})

test('chat switches safely and failed replies preserve the draft on mobile', async ({ page }) => {
  await setup(page, { slowChat: true, failWrite: 'chat_messages' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/admin/chats')
  await page.getByRole('button').filter({ hasText: 'Guest 1' }).click()
  await page.locator('.admin-chat-back').click()
  await page.getByRole('button').filter({ hasText: 'Guest 2' }).click()
  await expect(page.locator('.admin-chat-detail').getByText('Second conversation', { exact: true })).toBeVisible()
  await page.waitForTimeout(700)
  await expect(page.locator('.admin-chat-detail').getByText('First conversation', { exact: true })).toHaveCount(0)
  await page.getByPlaceholder(en.chats.replyPlaceholder).fill('Draft reply')
  await page.getByRole('button', { name: 'Submit', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByPlaceholder(en.chats.replyPlaceholder)).toHaveValue('Draft reply')
})

test('customer sessions cannot open the admin dashboard', async ({ page }) => {
  await setup(page, { role: 'customer' })
  await page.goto('/admin/hotels')
  await expect(page).toHaveURL('/')
  await expect(page.locator('.dashboard-shell')).toHaveCount(0)
})

test('photo uploads keep the hotel editor open until the image is ready', async ({ page }) => {
  await setup(page)
  let finish!: () => void
  const held = new Promise<void>(resolve => { finish = resolve })
  await page.route('https://booking.test/functions/v1/property-images', async route => {
    await held
    await route.fulfill({ json: { url: 'https://booking.test/new-photo.png' } })
  })
  await page.goto('/admin/hotels')
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: en.video.media, exact: true }).click()
  await dialog.locator('input[type=file]').first().setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from('mock image') })
  await expect(dialog.getByRole('button', { name: 'Next', exact: true })).toBeDisabled()
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeVisible()
  finish()
  await expect(dialog.getByRole('button', { name: 'Next', exact: true })).toBeEnabled()
})

test('booking status filters follow browser navigation', async ({ page }) => {
  await setup(page)
  await page.goto('/admin/bookings?status=pending')
  const confirmed = page.getByRole('button', { name: /^Confirmed/ })
  await confirmed.click()
  await expect(page).toHaveURL(/status=confirmed/)
  await page.goBack()
  await expect(page.getByRole('button', { name: /^Pending/ })).toHaveAttribute('aria-pressed', 'true')
})

test('hotel dialog remains usable when native modal dialogs are unavailable', async ({ page }) => {
  const state = await setup(page)
  await page.addInitScript(() => { Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { value: undefined }) })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/admin/hotels')
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('.hotel-editor-tabs')).toBeInViewport()
  await dialog.getByRole('button', { name: 'Next', exact: true }).focus()
  await page.keyboard.press('Tab')
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  expect(state.errors).toEqual([])
})

test('failed import room save can be retried without duplicating the hotel or account', async ({ page }) => {
  const state = await setup(page)
  await page.route('https://booking.test/functions/v1/import-hotel', route => route.fulfill({ json: { data: {
    ...hotel, room_types: [{ name: 'Double', base_price: 100, max_guests: 2 }],
  } } }))
  let roomAttempts = 0
  await page.route('https://booking.test/rest/v1/room_types*', async route => {
    roomAttempts++
    await route.fulfill(roomAttempts === 1 ? { status: 400, json: { message: 'Room save failed' } } : { json: [] })
  })
  await page.goto('/admin/import-hotel')
  await page.locator('input[type=url]').fill('https://www.booking.com/hotel/iq/example.html')
  await page.getByRole('button', { name: en.importHotel.importWithAi, exact: true }).click()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  // The parser may not supply rooms; add a room through the review editor.
  await page.getByRole('button', { name: /Rooms/ }).last().click()
  if (await page.locator('input[type=number]').count() === 0) await page.getByRole('button', { name: en.importHotel.addRoom, exact: true }).click()
  const roomInputs = page.locator('form input')
  await roomInputs.first().fill('Double')
  await page.locator('form input[type=number]').first().fill('100')
  await page.locator('form input[type=number]').last().fill('2')
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: en.importHotel.saveHotel, exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await page.getByRole('button', { name: en.importHotel.saveHotel, exact: true }).click()
  await expect(page.getByText(en.importHotel.successTitle, { exact: true })).toBeVisible()
  expect(state.writes.filter(w => w.path === 'register_user')).toHaveLength(1)
  const hotels = state.writes.filter(w => w.path === 'hotels')
  expect(hotels).toHaveLength(2)
  expect(hotels[0].body.id).toBe(hotels[1].body.id)
})
