import { test, expect } from '@playwright/test'

const imageUrl = 'https://cdn.supabase.co/storage/v1/object/public/hotel-images/stay.jpg'

test('production hotel images remain cached across online and offline reloads', async ({ page }) => {
  await page.route(/^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|images\.pexels\.com)\//, route => route.abort())
  await page.context().route(/^https:\/\/cdn\.supabase\.co\/storage\/v1\/object\/public\/hotel-images\/stay\.jpg.*/, route => route.fulfill({ contentType: 'image/png', path: 'public/Hotel_logo.png' }))
  await page.route(/^https:\/\/.*\/rest\/v1\//, route => {
    const path = new URL(route.request().url()).pathname
    let data: any = []
    if (path.endsWith('/current_profile')) data = null
    if (path.endsWith('/hotels')) data = [{ id: 'hotel-1', name: 'Cached Stay', city: 'Erbil', location: 'Center', images: [imageUrl], amenities: [], property_type: 'hotel', currency: 'USD', profit_margin_percentage: 0, room_types: [{ base_price: 100 }] }]
    return route.fulfill({ json: data })
  })

  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.stay-card')).toContainText('Cached Stay')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.waitForFunction(() => {
    const image = document.querySelector<HTMLImageElement>('.stay-card img')
    return image?.complete && image.naturalWidth > 0
  })

  await page.evaluate(async () => {
    const legacy = await caches.open('supabase-images')
    await legacy.put('/legacy-private-id', new Response('private'))
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => {
    const image = document.querySelector<HTMLImageElement>('.stay-card img')
    return image?.complete && image.naturalWidth > 0
  })
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).includes('public-hotel-images-v2'))).toBe(true)
  expect(await page.evaluate(async () => (await (await caches.open('public-hotel-images-v2')).keys()).some(request => new URL(request.url).pathname.endsWith('/stay.jpg')))).toBe(true)

  expect(await page.evaluate(() => caches.has('supabase-images'))).toBe(false)
  await page.context().setOffline(true)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.locator('.home-hero')).toBeVisible()
  expect(await page.evaluate(async url => (await fetch(url)).ok, imageUrl)).toBe(true)
  await expect.poll(() => page.evaluate(async () => (await (await caches.open('public-hotel-images-v2')).keys()).some(request => new URL(request.url).pathname.endsWith('/stay.jpg')))).toBe(true)
})
