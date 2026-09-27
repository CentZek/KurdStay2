import { test, expect, Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import en from '../../src/i18n/en'
import ar from '../../src/i18n/ar'
import ckb from '../../src/i18n/ckb'
import kmr from '../../src/i18n/kmr'

const hotelId = '10000000-0000-0000-0000-000000000001'
const bytes = readFileSync('tests/fixtures/property-tour.webm')
const poster = 'https://booking.test/poster.svg'
const video = 'https://booking.test/tour.webm'
const fixture = { name: 'farm-tour.webm', mimeType: 'video/webm', buffer: bytes }
const hotel = { id: hotelId, name: 'Mountain Farm', city: 'Duhok', country: 'Iraq', location: 'Mountains', address: 'Duhok',
  description: 'A peaceful farm stay.', images: [poster], amenities: [], currency: 'USD', profit_margin_percentage: 10,
  video_url: video, video_poster_url: poster, status: 'active' }

async function setup(page: Page, options: { lang?: string; role?: string; noVideo?: boolean; failComplete?: boolean; holdUpload?: boolean; failSave?: boolean; social?: string } = {}) {
  const state = { creates: 0, completes: 0, posts: 0, downloads: 0, submitted: [] as any[], videoSaves: [] as any[] }
  await page.addInitScript(({lang}) => { localStorage.setItem('language', lang); localStorage.setItem('kurdstay_session', 'test-session') }, { lang: options.lang || 'en' })
  await page.route(/^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|images\.pexels\.com)\//, route => route.abort())
  await page.route('https://booking.test/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname === '/poster.svg') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675"><rect width="1200" height="675" fill="#4c7164"/><path d="M0 600L400 100L850 600M550 650L950 180L1200 650" fill="#254b4c"/><text x="60" y="80" font-size="40" fill="#fff">Mountain Farm</text></svg>' })
    if (url.pathname === '/tour.webm') { state.downloads++; return route.fulfill({ contentType: 'video/webm', body: bytes }) }
    if (url.pathname === '/functions/v1/property-videos') {
      const body = request.postDataJSON()
      if (body.action === 'create') {
        state.creates++
        expect(body.type).toBe('video/webm')
        expect(body.size).toBe(bytes.length)
        return route.fulfill({ json: { id: 'upload-id', path: 'user/tour.webm', token: 'signed-token', posterSignedUrl: 'https://booking.test/poster-upload' } })
      }
      state.completes++
      if (options.failComplete && state.completes === 1) return route.fulfill({ status: 503, json: { error: 'UPLOAD_FAILED' } })
      return route.fulfill({ json: { url: video, poster } })
    }
    if (url.pathname === '/storage/v1/upload/resumable') {
      state.posts++
      expect(request.headers()['x-signature']).toBe('signed-token')
      if (options.holdUpload) return new Promise<void>(() => {})
      return route.fulfill({ status: 201, headers: { Location: 'https://booking.test/upload/1', 'Tus-Resumable': '1.0.0', 'Upload-Offset': String(bytes.length), 'Access-Control-Expose-Headers': 'Location, Upload-Offset, Tus-Resumable' } })
    }
    if (url.pathname === '/upload/1') return route.fulfill({ status: 204, headers: { 'Tus-Resumable': '1.0.0', 'Upload-Offset': String(bytes.length), 'Upload-Length': String(bytes.length), 'Access-Control-Expose-Headers': 'Upload-Offset, Upload-Length, Tus-Resumable' } })
    if (url.pathname === '/poster-upload') {
      expect(request.method()).toBe('PUT')
      expect(request.postDataBuffer()?.includes(Buffer.from([0xff,0xd8,0xff]))).toBe(true)
      return route.fulfill({ json: { Key: 'poster.jpg' } })
    }
    let data: any = []
    if (url.pathname.endsWith('/current_profile')) data = { id: 'user', name: 'Test Host', username: 'test', role: options.role || 'customer', language_preference: options.lang || 'en' }
    if (url.pathname.endsWith('/hotels')) {
      const listing={ ...hotel, ...(options.noVideo || options.social ? { video_url: null, video_poster_url: null } : {}),social_video_url:options.social||null }
      data = options.role === 'hotel_owner' || options.role === 'admin' ? [listing] : listing
    }
    if (url.pathname.endsWith('/accommodation_applications') && request.method() === 'POST') state.submitted.push(request.postDataJSON())
    if (url.pathname.endsWith('/set_hotel_video') || url.pathname.endsWith('/set_hotel_social_video')) {
      state.videoSaves.push(request.postDataJSON())
      if (options.failSave) return route.fulfill({ status: 500, json: { message: 'Save failed' } })
      data = null
    }
    return route.fulfill({ json: data })
  })
  return state
}

test('video-only application creates a real cover, retries finalization without reupload, and submits the video', async ({ page }) => {
  const state = await setup(page, { failComplete: true })
  await page.goto('/add-accommodation')
  const basics = page.locator('form input')
  await basics.nth(0).fill('Mountain Farm')
  await basics.nth(1).fill('Duhok')
  await basics.nth(2).fill('Mountain Road')
  await page.getByRole('button', { name: en.video.media, exact: true }).click()
  await page.locator('.video-uploader input[type=file]').setInputFiles(fixture)
  await expect(page.getByRole('alert')).toContainText(en.video.uploadFailed)
  await page.getByRole('button', { name: en.video.retry, exact: true }).click()
  await expect(page.getByText(en.video.ready, { exact: true })).toBeVisible()
  expect(state.creates).toBe(1)
  expect(state.posts).toBe(1)
  expect(state.completes).toBe(2)
  await page.getByRole('button', { name: en.addProperty.steps.contact, exact: true }).click()
  await page.getByRole('button', { name: en.addProperty.submitForReview, exact: true }).click()
  await expect(page.getByText(en.addProperty.successTitle, { exact: true })).toBeVisible()
  expect(state.submitted).toHaveLength(1)
  expect(state.submitted[0]).toMatchObject({ video_url: video, video_poster_url: poster, images: [poster] })
})

test('invalid and corrupt videos produce useful errors without an upload; incomplete transfers can be cancelled', async ({ page }) => {
  const state = await setup(page, { holdUpload: true })
  await page.goto('/add-accommodation')
  await page.getByRole('button', { name: en.video.media, exact: true }).click()
  const input = page.locator('.video-uploader input[type=file]')
  await input.setInputFiles({ name: 'not-video.html', mimeType: 'text/html', buffer: Buffer.from('<h1>bad</h1>') })
  await expect(page.getByRole('alert')).toContainText(en.video.invalidType)
  await input.setInputFiles({ name: 'broken.mp4', mimeType: 'video/mp4', buffer: Buffer.from('not a real video') })
  await expect(page.getByRole('alert')).toContainText(en.video.unplayable)
  expect(state.creates).toBe(0)
  await input.setInputFiles(fixture)
  await expect(page.getByText(en.video.uploading, { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: en.common.next, exact: true })).toBeDisabled()
  await page.locator('.video-uploader').getByRole('button', { name: en.common.cancel, exact: true }).click()
  await expect(page.getByRole('button', { name: en.common.next, exact: true })).toBeEnabled()
  await expect(page.getByText(en.video.ready, { exact: true })).toHaveCount(0)
  expect(state.submitted).toHaveLength(0)
})

for (const [lang, t] of Object.entries({ en, ar, ckb, kmr })) {
  test(`host video uploader fits a phone and shows a playable preview (${lang})`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await setup(page, { lang })
    await page.goto('/add-accommodation')
    await page.getByRole('button', { name: t.video.media, exact: true }).click()
    await page.locator('.video-uploader input[type=file]').setInputFiles(fixture)
    await expect(page.getByText(t.video.ready, { exact: true })).toBeVisible()
    await page.locator('.video-uploader').screenshot({ path: `tmp/video-uploader-${lang}.png` })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })

  test(`guest video plays only on request; photo switch stops playback; mobile layout (${lang})`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    const state = await setup(page, { lang })
    await page.goto(`/hotel/${hotelId}`)
    await expect(page.getByRole('heading', { name: hotel.name, exact: true })).toBeVisible()
    expect(state.downloads).toBe(0)
    await expect(page.locator('video')).toHaveCount(0)
    await page.locator('.property-media-switch').getByRole('button', { name: t.video.watch, exact: true }).click()
    await expect(page.locator('video')).toBeVisible()
    await expect.poll(() => page.locator('video').evaluate((el: HTMLVideoElement) => el.readyState)).toBeGreaterThanOrEqual(2)
    await expect(page.locator('video')).toHaveAttribute('controls', '')
    await expect(page.locator('video')).toHaveAttribute('playsinline', '')
    await page.screenshot({ path: `tmp/video-gallery-${lang}.png` })
    await page.locator('.property-media-switch button').first().click()
    await expect(page.locator('video')).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(errors).toEqual([])
  })
}

test('photo-only property keeps its gallery and does not show a video action', async ({ page }) => {
  await setup(page, { noVideo: true })
  await page.goto(`/hotel/${hotelId}`)
  await expect(page.locator('.property-photo-stage img')).toBeVisible()
  await expect(page.getByRole('button', { name: en.video.watch, exact: true })).toHaveCount(0)
})

test('owner replacement saves to the managed property; removing a video preserves photos', async ({ page }) => {
  const state = await setup(page, { role: 'hotel_owner' })
  await page.goto('/owner')
  await page.getByRole('button', { name: en.video.media, exact: true }).click()
  await page.locator('.video-uploader input[type=file]').setInputFiles(fixture)
  await expect.poll(() => state.videoSaves.length).toBe(1)
  expect(state.videoSaves[0]).toEqual({ p_hotel: hotelId, p_url: video, p_poster: poster })
  await page.getByRole('button', { name: en.video.remove, exact: true }).click()
  await expect.poll(() => state.videoSaves.length).toBe(2)
  expect(state.videoSaves[1]).toEqual({ p_hotel: hotelId, p_url: null, p_poster: null })
  await expect(page.locator('.video-upload-preview')).toHaveCount(0)
  await expect(page.getByRole('dialog').locator('img')).toHaveCount(1)
})

test('failed owner save retains the previous video and exposes a retry', async ({ page }) => {
  await setup(page, { role: 'hotel_owner', failSave: true })
  await page.goto('/owner')
  await page.getByRole('button', { name: en.video.media, exact: true }).click()
  await page.locator('.video-uploader input[type=file]').setInputFiles(fixture)
  await expect(page.locator('.video-upload-error')).toContainText(en.video.saveFailed)
  await expect(page.locator('.video-upload-preview')).toBeVisible()
  await expect(page.getByRole('button', { name: en.video.retry, exact: true })).toBeVisible()
})

test('social-only applications save a canonical link without uploading video bytes',async({page})=>{
  const state=await setup(page,{noVideo:true})
  await page.goto('/add-accommodation')
  const basics=page.locator('form input')
  await basics.nth(0).fill('Social Farm')
  await basics.nth(1).fill('Duhok')
  await basics.nth(2).fill('Mountain Road')
  await page.getByRole('button',{name:en.video.media,exact:true}).click()
  await page.getByRole('button',{name:en.socialVideo.link,exact:true}).click()
  await page.getByLabel(en.socialVideo.url,{exact:true}).fill('https://youtube.com.evil.test/video')
  await page.getByRole('button',{name:en.socialVideo.save,exact:true}).click()
  await expect(page.getByRole('alert')).toContainText(en.socialVideo.invalid)
  await page.getByLabel(en.socialVideo.url,{exact:true}).fill('https://www.instagram.com/reel/ABC123/?igsh=tracking')
  await page.getByRole('button',{name:en.socialVideo.save,exact:true}).click()
  await expect(page.locator('.social-video-player')).toBeVisible()
  await page.locator('.property-media-editor').screenshot({path:'tmp/social-editor.png'})
  await page.getByRole('button',{name:en.addProperty.steps.contact,exact:true}).click()
  await page.getByRole('button',{name:en.addProperty.submitForReview,exact:true}).click()
  await expect(page.getByText(en.addProperty.successTitle,{exact:true})).toBeVisible()
  expect(state.submitted[0]).toMatchObject({social_video_url:'https://www.instagram.com/reel/ABC123/',video_url:null,video_poster_url:null,images:[]})
  expect(state.creates).toBe(0)
  expect(state.posts).toBe(0)
})

test('social player loads only after a click and always offers the original public video',async({page})=>{
  await setup(page,{social:'https://www.youtube.com/watch?v=dQw4w9WgXcQ'})
  await page.route('https://www.youtube-nocookie.com/**',r=>r.fulfill({contentType:'text/html',body:'<p>External video player</p>'}))
  await page.goto(`/hotel/${hotelId}`)
  await expect(page.locator('.property-photo-stage img')).toBeVisible()
  await expect(page.locator('.property-gallery-section iframe')).toHaveCount(0)
  await page.locator('.property-media-switch').getByRole('button',{name:en.video.watch,exact:true}).click()
  await expect(page.locator('.property-gallery-section iframe')).toHaveAttribute('src',/^https:\/\/www.youtube-nocookie.com\/embed\/dQw4w9WgXcQ/)
  await expect(page.locator('.social-video-fallback')).toHaveAttribute('href','https://www.youtube.com/watch?v=dQw4w9WgXcQ')
  await page.locator('.property-media-switch button').first().click()
  await expect(page.locator('.property-gallery-section iframe')).toHaveCount(0)
})

test('owner can replace an uploaded video with a Facebook link without storage requests',async({page})=>{
  const state=await setup(page,{role:'hotel_owner'})
  await page.goto('/owner')
  await page.getByRole('button',{name:en.video.media,exact:true}).click()
  await page.getByRole('button',{name:en.socialVideo.link,exact:true}).click()
  await page.getByLabel(en.socialVideo.url,{exact:true}).fill('https://facebook.com/reel/123456789/')
  await page.getByRole('button',{name:en.socialVideo.save,exact:true}).click()
  await expect.poll(()=>state.videoSaves.length).toBe(1)
  expect(state.videoSaves[0]).toEqual({p_hotel:hotelId,p_url:'https://www.facebook.com/watch/?v=123456789'})
  expect(state.creates).toBe(0)
  await expect(page.locator('.social-video-fallback')).toHaveAttribute('href','https://www.facebook.com/watch/?v=123456789')
})
