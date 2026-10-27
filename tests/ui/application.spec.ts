import { test, expect } from '@playwright/test'
import en from '../../src/i18n/en'

test('an applicant edits and resubmits the same info_requested application', async ({ page }) => {
  const applicationId = '50000000-0000-0000-0000-000000000001'
  const writes: { method: string; body: any }[] = []
  await page.addInitScript(() => localStorage.setItem('kurdstay_session', 'customer-session'))
  await page.route(/^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|images\.pexels\.com)\//, route => route.abort())
  await page.route('https://booking.test/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname.split('/').pop()!
    let data: any = []
    if (path === 'current_profile') data = { id: 'customer-1', name: 'Host', username: 'host', role: 'customer', language_preference: 'en', phone: '+9647500000000' }
    if (path === 'app_capabilities') data = { applicationResubmit: true }
    if (path === 'accommodation_applications') {
      if (!['GET', 'HEAD'].includes(request.method())) writes.push({ method: request.method(), body: request.postDataJSON() })
      data = {
        id: applicationId, applicant_id: 'customer-1', property_name: 'Original Stay', property_type: 'hotel',
        city: 'Erbil', address: 'Old address', country: 'Iraq', status: 'info_requested',
        images: ['https://images.pexels.com/cover.jpg'], amenities: [], contact_person: 'Host', phone: '+9647500000000',
      }
    }
    await route.fulfill({ json: data })
  })

  await page.goto(`/add-accommodation?application=${applicationId}`, { waitUntil: 'domcontentloaded' })
  const name = page.getByLabel(en.addProperty.propertyName, { exact: false })
  await expect(name).toHaveValue('Original Stay')
  await name.fill('Improved Stay')
  await page.getByRole('button', { name: en.addProperty.steps.contact, exact: true }).click()
  await page.getByRole('button', { name: en.addProperty.submitForReview, exact: true }).click()

  await expect(page.getByRole('heading', { name: en.addProperty.successTitle, exact: true })).toBeVisible()
  expect(writes).toHaveLength(1)
  expect(writes[0].method).toBe('PATCH')
  expect(writes[0].body.id).toBeUndefined()
  expect(writes[0].body.status).toBe('pending')
  expect(writes[0].body.property_name).toBe('Improved Stay')
})
