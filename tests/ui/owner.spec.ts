import { test, expect, type Page } from '@playwright/test'
import en from '../../src/i18n/en'

const hotelId = '10000000-0000-0000-0000-000000000001'
const firstRoom = '20000000-0000-0000-0000-000000000001'
const secondRoom = '20000000-0000-0000-0000-000000000002'

async function mockOwnerApi(page: Page, options: { failRoomWrite?: boolean; staleAvailability?: boolean } = {}) {
  const completedAvailability: string[] = []
  await page.addInitScript(() => localStorage.setItem('kurdstay_session', 'owner-session'))
  await page.route('https://booking.test/**', async route => {
    if (new URL(route.request().url()).pathname.endsWith('/app_capabilities')) return route.fulfill({ json: { bookingSearch: true, adminReliability: true, applicationResubmit: true } })
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname.split('/').pop()!
    const write = !['GET', 'HEAD'].includes(request.method())
    let data: any = []

    if (path === 'current_profile') data = { id: 'owner-1', username: 'owner', name: 'Owner', role: 'hotel_owner', language_preference: 'en' }
    if (path === 'hotels') data = { id: hotelId, name: 'Test Hotel', currency: 'USD' }
    if (path === 'room_types') {
      if (write && options.failRoomWrite) return route.fulfill({ status: 400, json: { message: 'Write denied' } })
      data = write ? { id: firstRoom } : [
        { id: firstRoom, name: 'First room', base_price: 100, max_guests: 2, images: [], amenities: [] },
        { id: secondRoom, name: 'Second room', base_price: 120, max_guests: 3, images: [], amenities: [] },
      ]
    }
    if (path === 'room_availability') {
      const roomId = url.searchParams.get('room_type_id')?.replace('eq.', '') || firstRoom
      if (options.staleAvailability && roomId === firstRoom) await new Promise(resolve => setTimeout(resolve, 500))
      completedAvailability.push(roomId)
      data = [{ room_type_id: roomId, date: new Date().toLocaleDateString('en-CA'), available_rooms: roomId === firstRoom ? 9 : 2, base_price_override: null, is_closed: false }]
    }
    await route.fulfill({ json: data })
  })
  return { completedAvailability }
}

test('failed room creation keeps the dialog and entered values open', async ({ page }) => {
  await mockOwnerApi(page, { failRoomWrite: true })
  await page.goto(`/owner/rooms/${hotelId}`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: en.owner.addRoomType, exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel(en.owner.roomName, { exact: false }).fill('Unsaved room')
  await dialog.locator('#room-base-price').fill('150')
  await dialog.getByRole('button', { name: en.common.save, exact: true }).click()

  await expect(page.getByRole('alert')).toBeVisible()
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel(en.owner.roomName, { exact: false })).toHaveValue('Unsaved room')
})

test('a slow previous room cannot overwrite the selected availability', async ({ page }) => {
  const { completedAvailability } = await mockOwnerApi(page, { staleAvailability: true })
  await page.goto(`/owner/availability/${hotelId}`, { waitUntil: 'domcontentloaded' })
  const roomSelect = page.getByLabel(en.owner.roomTypes, { exact: true })
  await expect(roomSelect).toBeVisible()
  await roomSelect.selectOption(secondRoom)
  await expect.poll(() => completedAvailability).toContain(firstRoom)
  await expect.poll(() => completedAvailability).toContain(secondRoom)
  await expect(page.locator('.availability-table tbody tr').first().locator('input[type="number"]').first()).toHaveValue('2')
})
