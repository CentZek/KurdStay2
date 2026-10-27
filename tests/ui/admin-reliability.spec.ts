import { test, expect, type Page } from '@playwright/test'
import en from '../../src/i18n/en'

const hotel = { id: 'hotel-1', name: 'Reliability Hotel', city: 'Erbil', country: 'Iraq', location: 'Center',
  description: '', images: [], amenities: [], currency: 'USD', profit_margin_percentage: 10, status: 'active', property_type: 'hotel' }
const booking = { id: 'booking-1', hotel_id: hotel.id, customer_name: 'Guest', customer_email: 'guest@example.test',
  customer_phone: '+9647500000000', check_in_date: '2030-10-10', check_out_date: '2030-10-12', guests: 2, rooms: 1,
  base_price_total: 200, margin_percentage: 10, margin_amount: 20, final_price_total: 220, status: 'pending', created_at: '2030-01-01',
  hotels: { name: hotel.name, currency: 'USD' }, room_types: { name: 'Double' } }

async function setup(page: Page) {
  const requests: { path: string; body: any }[] = []
  await page.addInitScript(() => localStorage.setItem('kurdstay_session', 'test-session'))
  await page.route(/^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|images\.pexels\.com)\//, route => route.abort())
  await page.route('https://booking.test/**', async route => {
    if (new URL(route.request().url()).pathname.endsWith('/app_capabilities')) return route.fulfill({ json: { bookingSearch: true, adminReliability: true, applicationResubmit: true } })
    const request = route.request()
    const path = new URL(request.url()).pathname.split('/').pop()!
    const body = request.postDataJSON()
    requests.push({ path, body })
    if (path === 'current_profile') return route.fulfill({ json: { id: 'admin-1', username: 'admin', name: 'Admin', role: 'admin', language_preference: 'en' } })
    if (path === 'admin_dashboard_stats') return route.fulfill({ json: { hotels: 1, bookings: 1, pending: 1, confirmed: 0, open_chats: 0, pending_applications: 0, commission: [] } })
    if (path === 'admin_list_bookings') return route.fulfill({ json: { items: body.p_offset === 0 ? [booking] : [{ ...booking, id: 'booking-2', customer_name: 'Second Guest' }], total: 2, status_counts: { all: 2, pending: 2, confirmed: 0, cancelled: 0, completed: 0 } } })
    if (path === 'bookings') {
      Object.assign(booking, body)
      return route.fulfill({ json: booking })
    }
    if (path === 'admin_list_chat_sessions') return route.fulfill({ json: {
      items: body.p_offset === 0 ? [{ id: 'chat-1', customer_phone: 'Guest 1', status: 'open', intent: 'other', needs_agent: false,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(), last_message: 'Latest message', message_count: 3 }] : [],
      total: 26,
    } })
    if (path === 'chat_messages') return route.fulfill({ json: [{ id: 'message-1', session_id: 'chat-1', role: 'customer', content: 'Latest message', created_at: new Date().toISOString() }] })
    if (path === 'profiles' || path === 'hotels') return route.fulfill({ json: [] })
    return route.fulfill({ json: [] })
  })
  return requests
}

test('booking confirmation awaits WhatsApp and exposes provider failure with retry', async ({ page }) => {
  await setup(page)
  let release!: () => void
  let attempts = 0
  const pending = new Promise<void>(resolve => { release = resolve })
  await page.route('https://booking.test/functions/v1/whatsapp-notify', async route => {
    attempts++
    if (attempts === 1) {
      await pending
      return route.fulfill({ json: { success: false, error: 'Provider unavailable', results: [{ recipient: 'customer', sent: false, retryable: true }] } })
    }
    return route.fulfill({ json: { success: true, results: [{ recipient: 'customer', sent: true, retryable: false }] } })
  })
  await page.goto('/admin/bookings')
  const confirm = page.getByRole('button', { name: en.common.confirm, exact: true })
  await confirm.click()
  await expect(confirm).toBeDisabled()
  await expect(page.getByRole('alert')).toHaveCount(0)
  release()
  await expect(page.getByRole('alert')).toContainText(en.common.errorOccurred)
  await expect(page.getByRole('button', { name: en.booking.markComplete, exact: true })).toBeVisible()
  await page.getByRole('alert').getByRole('button', { name: en.ux.retry, exact: true }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(attempts).toBe(2)
})

test('booking and chat lists use RPC pagination without chat metadata fanout', async ({ page }) => {
  const requests = await setup(page)
  await page.goto('/admin/bookings')
  await expect(page.getByText('1 / 2', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: en.common.loadMore, exact: true }).click()
  await expect(page.getByText('Second Guest', { exact: true })).toBeVisible()
  expect(requests.filter(request => request.path === 'admin_list_bookings').at(-1)?.body.p_offset).toBe(1)

  await page.goto('/admin/chats')
  await expect(page.getByText('Latest message', { exact: true })).toBeVisible()
  expect(requests.filter(request => request.path === 'chat_messages')).toHaveLength(0)
  expect(requests.filter(request => request.path === 'chat_sessions')).toHaveLength(0)
  await page.getByRole('button', { name: en.common.next, exact: true }).click()
  expect(requests.filter(request => request.path === 'admin_list_chat_sessions').at(-1)?.body.p_offset).toBe(25)
})

test('import retries one transactional RPC and shows credentials only after commit', async ({ page }) => {
  const requests = await setup(page)
  let attempts = 0
  await page.route('https://booking.test/functions/v1/import-hotel', route => route.fulfill({ json: { data: {
    ...hotel, room_types: [{ name: 'Double', base_price: 100, max_guests: 2 }],
  } } }))
  await page.route('https://booking.test/rest/v1/rpc/admin_import_hotel', route => {
    attempts++
    if (attempts === 1) return route.fulfill({ status: 400, json: { message: 'Transaction rolled back' } })
    return route.fulfill({ json: { success: true, hotel_id: hotel.id, owner_id: 'owner-1', credentials: {
      username: 'committedowner', password: 'password123', name: 'Committed Owner',
    } } })
  })
  await page.goto('/admin/import-hotel')
  await page.locator('input[type=url]').fill('https://www.booking.com/hotel/iq/example.html')
  await page.getByRole('button', { name: en.importHotel.importWithAi, exact: true }).click()
  await page.getByRole('button', { name: en.common.settings, exact: true }).click()
  await page.getByRole('button', { name: en.importHotel.saveHotel, exact: true }).click()
  await expect(page.getByRole('alert')).toContainText(en.common.errorOccurred)
  await expect(page.getByText(en.importHotel.successTitle, { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: en.importHotel.saveHotel, exact: true }).click()
  await expect.poll(() => attempts).toBe(2)
  await expect(page.getByText(en.importHotel.successTitle, { exact: true })).toBeVisible()
  await expect(page.getByText('committedowner', { exact: true })).toBeVisible()
  expect(attempts).toBe(2)
  expect(requests.filter(request => request.body && ['register_user', 'hotels', 'room_types'].includes(request.path))).toHaveLength(0)
})
