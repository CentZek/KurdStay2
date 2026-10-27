import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadTs } from './helpers/load-ts.mjs'

const { callPhoneVerification } = loadTs('src/lib/verification.ts')

test('account verification sends authenticated payloads and parses successful responses', async () => {
  let request
  const result = await callPhoneVerification('send', { profile_id: 'profile-1' }, {
    url: 'https://example.test/phone-verification',
    headers: { Authorization: 'Bearer test' },
    fetchImpl: async (url, init) => {
      request = { url, init }
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    },
  })
  assert.equal(request.url, 'https://example.test/phone-verification')
  assert.equal(request.init.headers.Authorization, 'Bearer test')
  assert.deepEqual(JSON.parse(request.init.body), { action: 'send', profile_id: 'profile-1' })
  assert.ok(request.init.signal)
  assert.equal(result.ok, true)
  assert.equal(result.error, null)
  assert.deepEqual(result.body, { success: true })
})

test('account verification turns network failures into useful results instead of throwing', async () => {
  const result = await callPhoneVerification('verify', { code: '123456' }, {
    url: 'https://example.test/phone-verification',
    headers: {},
    fetchImpl: async () => { throw new TypeError('Connection offline') },
  })
  assert.equal(result.ok, false)
  assert.equal(result.status, 0)
  assert.match(result.error, /Connection offline/)
})

test('account verification aborts stalled requests and always settles', async () => {
  const result = await callPhoneVerification('send', {}, {
    url: 'https://example.test/phone-verification',
    headers: {},
    timeoutMs: 5,
    fetchImpl: async (_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    }),
  })
  assert.equal(result.ok, false)
  assert.match(result.error, /took too long/)
})

test('account verification reports malformed and unsuccessful HTTP responses', async () => {
  const result = await callPhoneVerification('send', {}, {
    url: 'https://example.test/phone-verification',
    headers: {},
    fetchImpl: async () => new Response('not json', { status: 502 }),
  })
  assert.equal(result.ok, false)
  assert.equal(result.status, 502)
  assert.match(result.error, /unreadable response/)
})
