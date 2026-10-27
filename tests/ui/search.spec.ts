import en from '../../src/i18n/en'
import { test, expect, Page } from '@playwright/test'

const hotelId = '10000000-0000-0000-0000-000000000001'

function hotel(id: string, name: string, total = 1) {
  return {
    id, name, location: 'Center', city: 'Erbil', images: [], amenities: [], property_type: 'hotel',
    currency: 'USD', min_price: 110, max_guests: 2, popularity_score: 0, booking_count: 0, total_count: total,
  }
}

async function mockSearch(page: Page, handler?: (body: any, count: number) => Promise<any> | any) {
  const requests: any[] = []
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route(/^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|images\.pexels\.com)\//, route => route.abort())
  await page.route('https://booking.test/**', async route => {
    if (new URL(route.request().url()).pathname.endsWith('/app_capabilities')) return route.fulfill({ json: { bookingSearch: true, adminReliability: true, applicationResubmit: true } })
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname.endsWith('/search_hotels')) {
      const body = request.postDataJSON()
      requests.push(body)
      const result = handler ? await handler(body, requests.length) : [hotel(hotelId, 'Mountain View Retreat')]
      return route.fulfill({ status: result?.status || 200, json: result?.json || result })
    }
    if (url.pathname.endsWith('/current_profile')) return route.fulfill({ json: null })
    return route.fulfill({ json: [] })
  })
  return { requests, errors }
}

test('search normalizes malformed URL inputs before calling the RPC', async ({ page }) => {
  const { requests, errors } = await mockSearch(page)
  await page.goto('/search?location=%20Erbil%20&type=castle&checkIn=invalid&checkOut=2030-02-30&guests=-4&rooms=99&sort=random', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Mountain View Retreat' })).toBeVisible()
  expect(requests[0]).toMatchObject({
    p_location: 'Erbil', p_property_type: null, p_check_in: null, p_check_out: null,
    p_guests: 1, p_rooms: 1, p_sort: 'popular', p_limit: 12, p_offset: 0,
  })
  const href = await page.getByRole('link', { name: /Mountain View Retreat/ }).getAttribute('href')
  expect(href).toContain('guests=1')
  expect(href).not.toContain('castle')
  expect(href).not.toContain('checkIn')
  expect(errors).toEqual([])
})

test('date search, URL sorting and load-more pagination stay server-side', async ({ page }) => {
  const { requests } = await mockSearch(page, body => {
    const count = Math.min(body.p_limit, 13 - body.p_offset)
    return Array.from({ length: count }, (_, index) => hotel(`10000000-0000-0000-0000-${String(body.p_offset + index + 1).padStart(12, '0')}`, `Stay ${body.p_offset + index + 1}`, 13))
  })
  await page.goto('/search?checkIn=2030-10-10&checkOut=2030-10-12&guests=2&rooms=2', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Stay 1', exact: true })).toBeVisible()
  expect(requests[0]).toMatchObject({ p_check_in: '2030-10-10', p_check_out: '2030-10-12', p_guests: 2, p_rooms: 2 })
  await expect(page.getByRole('button', { name: /Load more/ })).toBeVisible()
  await page.getByRole('button', { name: 'Price: Low to High', exact: true }).click()
  await expect(page).toHaveURL(/sort=price_low/)
  await expect.poll(() => requests.at(-1)?.p_sort).toBe('price_low')
  await page.getByRole('button', { name: /Load more/ }).click()
  await expect.poll(() => requests.at(-1)?.p_offset).toBe(12)
  expect(requests.at(-1)?.p_limit).toBe(12)
  await expect(page.getByRole('heading', { name: 'Stay 13', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /Load more/ })).toHaveCount(0)
})

test('late search responses cannot replace newer filter results', async ({ page }) => {
  const { requests } = await mockSearch(page, async body => {
    if (body.p_location === 'Erbil') {
      await new Promise(resolve => setTimeout(resolve, 400))
      return [hotel(hotelId, 'Old Erbil Result')]
    }
    return [hotel('10000000-0000-0000-0000-000000000002', 'New Duhok Result')]
  })
  await page.goto('/search?location=Erbil', { waitUntil: 'domcontentloaded' })
  await page.getByLabel('Location', { exact: true }).fill('Duhok')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'New Duhok Result' })).toBeVisible()
  await expect.poll(() => requests.filter(request => request.p_location === 'Duhok').length).toBeGreaterThan(0)
  await page.waitForTimeout(500)
  await expect(page.getByRole('heading', { name: 'New Duhok Result' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Old Erbil Result' })).toHaveCount(0)
})

test('search failures offer a working retry', async ({ page }) => {
  let shouldFail = true
  const { requests } = await mockSearch(page, () => shouldFail
    ? { status: 503, json: { message: 'Temporary failure' } }
    : [hotel(hotelId, 'Recovered Result')])
  await page.goto('/search', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('alert')).toContainText('Something went wrong')
  shouldFail = false
  await page.getByRole('button', { name: en.booking.retry, exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Recovered Result' })).toBeVisible()
  expect(requests.length).toBeGreaterThanOrEqual(2)
})


test('search paginates beyond fifty properties without duplicates or oversized RPC requests', async ({ page }) => {
  const { requests } = await mockSearch(page, body => Array.from({ length: Math.min(body.p_limit, 61 - body.p_offset) }, (_, i) =>
    hotel(`stay-${body.p_offset + i}`, `Paged stay ${body.p_offset + i + 1}`, 61)))
  await page.goto('/search')
  for (let count = 12; count < 61; count += 12) {
    await expect(page.getByRole('heading', { name: `Paged stay ${count}`, exact: true })).toBeVisible()
    await page.getByRole('button', { name: /Load more/ }).click()
  }
  await expect(page.getByRole('heading', { name: 'Paged stay 61', exact: true })).toBeVisible()
  await expect(page.locator('.stay-card')).toHaveCount(61)
  expect(requests.every(request => request.p_limit <= 50)).toBe(true)
  expect([...new Set(requests.map(request => request.p_offset))]).toEqual([0, 12, 24, 36, 48, 60])
})

test('a database without the new capability function keeps the existing search usable', async ({ page }) => {
  const { requests } = await mockSearch(page)
  await page.route('**/rpc/app_capabilities', route => route.fulfill({ status: 404, json: { code: 'PGRST202', message: 'Function not found' } }))
  await page.route('**/rest/v1/hotels*', route => route.fulfill({ json: [{ ...hotel(hotelId, 'Existing property'), profit_margin_percentage: 10, room_types: [{ base_price: 100, max_guests: 2 }] }] }))
  await page.goto('/search')
  await expect(page.getByRole('heading', { name: 'Existing property' })).toBeVisible()
  expect(requests).toHaveLength(0)
})
