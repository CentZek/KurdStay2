import { test, expect } from '@playwright/test'

test('login fields are labelled and a network failure does not leave the form busy', async ({ page }) => {
  await page.route('https://booking.test/**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/login')) return route.abort('failed')
    return route.fulfill({ json: null })
  })

  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  const username = page.getByLabel('Username', { exact: true })
  const password = page.getByLabel('Password', { exact: true })
  await expect(username).toHaveAttribute('autocomplete', 'username')
  await expect(password).toHaveAttribute('autocomplete', 'current-password')
  await username.fill('guest')
  await password.fill('password123')
  await page.getByRole('button', { name: 'Sign In', exact: true }).click()

  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeEnabled()
  await expect(username).toHaveValue('guest')
})


test('a delayed old session restoration cannot erase a newer login', async ({ page }) => {
  let release!: () => void
  const held = new Promise<void>(resolve => { release = resolve })
  await page.addInitScript(() => localStorage.setItem('kurdstay_session', 'old-session'))
  await page.route('https://booking.test/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/current_profile')) { await held; return route.fulfill({ json: null }) }
    if (path.endsWith('/login')) return route.fulfill({ json: { success: true, session_token: 'new-session', user: { id: 'new-admin', name: 'Admin', username: 'admin', role: 'admin', language_preference: 'en' } } })
    return route.fulfill({ json: [] })
  })
  await page.goto('/login')
  await page.getByLabel('Username', { exact: true }).fill('admin')
  await page.getByLabel('Password', { exact: true }).fill('test-password')
  await page.getByRole('button', { name: 'Sign In', exact: true }).click()
  await expect.poll(() => page.evaluate(() => localStorage.getItem('kurdstay_session'))).toBe('new-session')
  const restored = page.waitForResponse(response => response.url().endsWith('/current_profile'))
  release()
  await restored
  await page.waitForTimeout(100)
  await expect(page.getByRole('link', { name: 'Dashboard', exact: true }).first()).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('kurdstay_session'))).toBe('new-session')
})

test('a temporary restore failure on an admin route keeps the session and offers retry', async ({ page }) => {
  let failing = true
  await page.addInitScript(() => localStorage.setItem('kurdstay_session', 'valid-session'))
  await page.route('https://booking.test/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/current_profile')) return route.fulfill(failing
      ? { status: 503, json: { message: 'Temporary network failure' } }
      : { json: { id: 'admin-1', name: 'Admin', role: 'admin', language_preference: 'en' } })
    return route.fulfill({ json: [] })
  })
  await page.goto('/admin')
  await expect(page.getByRole('alert')).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('kurdstay_session'))).toBe('valid-session')
  failing = false
  await page.getByRole('alert').getByRole('button').click()
  await expect(page.locator('.workspace-sidebar')).toBeVisible()
  await expect(page).toHaveURL(/\/admin$/)
})
