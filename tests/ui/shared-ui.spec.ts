import { test, expect, type Page } from '@playwright/test'
import en from '../../src/i18n/en'
import ar from '../../src/i18n/ar'

async function mockApi(page: Page) {
  await page.route(/^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|images\.pexels\.com)\//, route => route.abort())
  await page.route('https://booking.test/**', route => {
    const path = new URL(route.request().url()).pathname
    const data = path.endsWith('/current_profile') ? null : path.endsWith('/chat_stay_catalog') ? { cities: ['Duhok'], amenities: [] } : []
    return route.fulfill({ json: data })
  })
}

test('route changes set a localized title and move focus to main without losing the skip link', async ({ page }) => {
  await mockApi(page)
  await page.goto('/')
  await expect(page).toHaveTitle(`${en.routes.home} | ${en.common.appTitle}`)
  await page.getByRole('link', { name: en.common.browseProperties, exact: true }).first().click()
  await expect(page).toHaveTitle(`${en.routes.search} | ${en.common.appTitle}`)
  await expect(page.locator('#main-content')).toBeFocused()
  await page.locator('.skip-link').focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('#main-content')).toBeFocused()
})

test('desktop language menu supports selected semantics, arrow keys, Home, End and Escape', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await mockApi(page)
  await page.goto('/')
  const trigger = page.getByRole('button', { name: en.common.language, exact: true })
  await trigger.click()
  const menu = page.getByRole('menu', { name: en.common.language })
  await expect(menu.getByRole('menuitemradio', { name: 'English' })).toHaveAttribute('aria-checked', 'true')
  await expect(menu.getByRole('menuitemradio', { name: 'English' })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(menu.getByRole('menuitemradio', { name: 'کوردی (سۆرانی)' })).toBeFocused()
  await page.keyboard.press('End')
  await expect(menu.getByRole('menuitemradio', { name: 'العربية' })).toBeFocused()
  await page.keyboard.press('Home')
  await expect(menu.getByRole('menuitemradio', { name: 'English' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await trigger.click()
  await page.getByRole('menuitemradio', { name: 'العربية' }).click()
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(page.getByRole('link', { name: ar.common.home, exact: true }).first()).toBeVisible()
  await expect(page.locator('.header-language > button')).toBeFocused()
})

test('non-English dictionaries load on demand and retain the selected document language', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await mockApi(page)
  await page.addInitScript(() => localStorage.setItem('language', 'ar'))
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar')
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(page.getByRole('link', { name: ar.common.browseProperties, exact: true }).first()).toBeVisible()
  await expect(page).toHaveTitle(`${ar.routes.home} | ${ar.common.appTitle}`)
  expect(await page.evaluate(() => localStorage.getItem('language'))).toBe('ar')
})

test('offline status is announced and offsets the sticky header', async ({ page }) => {
  await mockApi(page)
  await page.goto('/')
  await page.context().setOffline(true)
  const status = page.getByRole('status').filter({ hasText: en.offline.message })
  await expect(status).toBeVisible()
  await expect(status).toHaveAttribute('aria-live', 'polite')
  const header = await page.locator('.site-header').boundingBox()
  const notice = await status.boundingBox()
  expect(header!.y).toBeGreaterThanOrEqual(notice!.height)
  await page.context().setOffline(false)
  await expect(status).toHaveCount(0)
})

test('chat contains Tab focus and restores the launcher on Escape', async ({ page }) => {
  await mockApi(page)
  await page.goto('/')
  const launcher = page.locator('.chat-launcher')
  await launcher.click()
  const dialog = page.getByRole('dialog', { name: en.chatbot.title })
  const input = dialog.getByRole('textbox', { name: en.assistant.message })
  await expect(input).toBeFocused()
  await dialog.getByRole('button', { name: en.chatbot.newConversation }).focus()
  await page.keyboard.press('Shift+Tab')
  await expect(input).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(launcher).toBeFocused()
})

test('chat results localize dates and singular room/night counts', async ({ page }) => {
  const stay = { id: 'hotel-1', roomId: 'room-1', name: 'Mountain stay', city: 'Duhok', image: null, roomName: 'Suite', total: 100, currency: 'USD', nights: 1, guests: 1, rooms: 1, checkIn: '2030-01-02', checkOut: '2030-01-03', amenities: [] }
  await page.addInitScript(() => localStorage.setItem('language', 'ar'))
  await page.route('https://booking.test/**', route => {
    const path = new URL(route.request().url()).pathname
    let data: any = path.endsWith('/current_profile') ? null : []
    if (path.endsWith('/chat_stay_catalog')) data = { cities: ['Duhok'], amenities: [] }
    if (path.endsWith('/chat_sessions')) data = { id: 'session-1' }
    if (path.endsWith('/find_chat_stays')) data = [stay]
    return route.fulfill({ json: data })
  })
  await page.goto('/')
  await page.locator('.chat-launcher').click()
  const dialog = page.getByRole('dialog', { name: ar.chatbot.title })
  await dialog.getByRole('button', { name: ar.assistant.chooseDates, exact: true }).click()
  const form = dialog.locator('.chat-trip-form')
  await form.getByLabel(ar.common.location, { exact: true }).selectOption('Duhok')
  await form.getByLabel(ar.common.checkIn, { exact: true }).fill(stay.checkIn)
  await form.getByLabel(ar.common.checkOut, { exact: true }).fill(stay.checkOut)
  await form.getByRole('button', { name: ar.assistant.findStays, exact: true }).click()
  const card = dialog.locator('.chat-stay-card')
  await expect(card).toBeVisible()
  await expect(card.locator('.chat-stay-dates')).toContainText(new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date('2030-01-02T00:00:00Z')))
  await expect(card).toContainText(ar.common.roomCount_one)
  await expect(card).toContainText(ar.common.nightCount_one)
})

test('agent polling is limited, incremental, and paused while hidden', async ({ page }) => {
  const polls: string[] = []
  await mockApi(page)
  await page.unroute('https://booking.test/**')
  await page.route('https://booking.test/**', route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname
    if (path.endsWith('/chat_messages') && request.method() === 'GET') polls.push(url.search)
    let data: any = path.endsWith('/current_profile') ? null : []
    if (path.endsWith('/chat_messages') && request.method() === 'GET' && !url.searchParams.has('created_at')) {
      data = [{ id: 'agent-1', content: 'Hello', created_at: '2030-01-01T00:00:00Z' }]
    }
    if (path.endsWith('/chat_stay_catalog')) data = { cities: [], amenities: [] }
    if (path.endsWith('/chat_sessions') && request.method() === 'POST') data = { id: '30000000-0000-0000-0000-000000000001' }
    if (path.endsWith('/request_chat_agent')) data = null
    return route.fulfill({ json: data })
  })
  await page.goto('/')
  await page.locator('.chat-launcher').click()
  await page.getByRole('button', { name: en.chatbot.talkToAgent, exact: true }).click()
  await expect.poll(() => polls.length).toBe(1)
  expect(polls[0]).toContain('limit=25')
  await expect.poll(() => polls.length, { timeout: 7000 }).toBe(2)
  expect(polls[1]).toContain('created_at.gt.2030-01-01T00%3A00%3A00Z')
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.waitForTimeout(4500)
  expect(polls).toHaveLength(2)
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect.poll(() => polls.length).toBe(3)
})

test('iOS install instructions are a named modal with focus containment and Escape restoration', async ({ page }) => {
  await mockApi(page)
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1' })
  })
  await page.goto('/')
  const howTo = page.getByRole('button', { name: en.install.howTo, exact: true })
  await expect(howTo).toBeVisible({ timeout: 6000 })
  await howTo.click()
  const dialog = page.getByRole('dialog', { name: en.install.iosTitle })
  await expect(dialog).toBeVisible()
  const close = dialog.getByRole('button', { name: en.install.closeInstructions })
  await expect(close).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(dialog.getByRole('button', { name: en.install.gotIt })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(howTo).toBeFocused()
  await expect(page.getByRole('button', { name: en.install.dismiss })).toBeVisible()
})

test('a failed lazy route has a localized alert and retry/reload actions', async ({ page }) => {
  await mockApi(page)
  const abortHome = (route: any) => route.abort()
  await page.route('**/src/pages/public/HomePage.tsx*', abortHome)
  await page.goto('/')
  const alert = page.getByRole('alert')
  await expect(alert.getByRole('heading', { name: en.ux.loadErrorTitle })).toBeVisible()
  await expect(alert.getByRole('button', { name: en.ux.reload, exact: true })).toBeVisible()
  await page.unroute('**/src/pages/public/HomePage.tsx*', abortHome)
  await alert.getByRole('button', { name: en.ux.retry, exact: true }).click()
  await expect(page.locator('.home-hero')).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
})
