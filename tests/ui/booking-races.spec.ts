import { test, expect, Page } from '@playwright/test'

const firstId = '10000000-0000-0000-0000-000000000001'
const secondId = '10000000-0000-0000-0000-000000000002'

async function mockBootstrap(page: Page) {
  await page.route(/^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|images\.pexels\.com)\//, route => route.abort())
  await page.route('**/rest/v1/rpc/app_capabilities', route => route.fulfill({ json: { bookingSearch: true, adminReliability: true, applicationResubmit: true } }))
  await page.route('**/rest/v1/rpc/current_profile', route => route.fulfill({ json: null }))
}

test('hotel detail ignores a previous property response after route changes', async ({ page }) => {
  await mockBootstrap(page)
  await page.route('**/rest/v1/hotels*', async route => {
    const id = new URL(route.request().url()).searchParams.get('id')?.slice(3)
    if (id === firstId) await new Promise(resolve => setTimeout(resolve, 400))
    await route.fulfill({ json: {
      id, name: id === firstId ? 'Old Property' : 'New Property', location: 'Center', city: 'Erbil', country: 'Iraq',
      description: '', address: '', images: [], amenities: [], currency: 'USD', profit_margin_percentage: 10,
    } })
  })
  await page.route('**/rest/v1/room_types*', route => route.fulfill({ json: [] }))
  await page.goto(`/hotel/${firstId}`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(id => {
    history.pushState({}, '', `/hotel/${id}`)
    dispatchEvent(new PopStateEvent('popstate'))
  }, secondId)
  await expect(page.getByRole('heading', { name: 'New Property', exact: true })).toBeVisible()
  await page.waitForTimeout(500)
  await expect(page.getByRole('heading', { name: 'Old Property', exact: true })).toHaveCount(0)
})

test('confirmation ignores a previous booking response after route changes', async ({ page }) => {
  await mockBootstrap(page)
  await page.route('**/rest/v1/bookings*', async route => {
    const id = new URL(route.request().url()).searchParams.get('id')?.slice(3)
    if (id === firstId) await new Promise(resolve => setTimeout(resolve, 400))
    await route.fulfill({ json: {
      id, status: 'pending', check_in_date: '2030-10-10', check_out_date: '2030-10-12', guests: 2,
      rooms: 1, final_price_total: 275, hotels: { name: 'Mountain View Retreat', currency: 'USD' }, room_types: { name: 'Double' },
    } })
  })
  await page.goto(`/booking/confirmation/${firstId}`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(id => {
    history.pushState({}, '', `/booking/confirmation/${id}`)
    dispatchEvent(new PopStateEvent('popstate'))
  }, secondId)
  await expect(page.getByText(secondId, { exact: true })).toBeVisible()
  await page.waitForTimeout(500)
  await expect(page.getByText(firstId, { exact: true })).toHaveCount(0)
})
