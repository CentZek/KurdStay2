import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTs } from './helpers/load-ts.mjs'
const { normalizeDigits, validDate, missingSearch, emptySearch, parsePlan, stayLink } = loadTs('supabase/functions/chatbot/search.ts')
const { parseSocialVideo, videoColumns } = loadTs('src/lib/socialVideo.ts')

test('trip planning understands local digits and rejects invalid or incomplete dates and budgets', () => {
  assert.equal(normalizeDigits('٢ guests, ۲۰۲۷-۰۲-۰۱'), '2 guests, 2027-02-01')
  assert.equal(validDate('2028-02-29'), true)
  for (const date of ['2027-02-29','03/04','2027-13-01','2027-1-01']) assert.equal(validDate(date), false)
  const trip = { ...emptySearch, city:'Erbil', checkIn:'2027-02-01', checkOut:'2027-02-03',guests:4,rooms:2 }
  assert.deepEqual(missingSearch(trip,'2027-01-01'), [])
  assert.deepEqual(missingSearch({...trip,maxTotal:200},'2027-01-01'), ['currency'])
  assert.ok(missingSearch({...trip,checkOut:trip.checkIn},'2027-01-01').includes('checkOut'))
  const href = new URL(stayLink('10000000-0000-0000-0000-000000000001',trip,'20000000-0000-0000-0000-000000000001'),'https://kurdstay.com')
  assert.equal(href.searchParams.get('rooms'),'2')
  assert.equal(href.searchParams.get('checkIn'),trip.checkIn)
  assert.equal(href.searchParams.get('guests'),'4')
  assert.throws(()=>stayLink('https://evil.test',trip))
})

test('malformed AI filters fail closed instead of becoming unrestricted searches', () => {
  const plan = {reply:'Which dates?',criteria:emptySearch,ready:false,suggestions:['Next week']}
  assert.equal(parsePlan(JSON.stringify(plan)).reply,plan.reply)
  for (const invalid of [{rooms:6},{maxTotal:-1},{propertyType:'castle'},{currency:'EUR'},{amenities:['']},{amenities:Array(11).fill('Pool')},{checkIn:'2027-02-30'}]) {
    assert.throws(()=>parsePlan(JSON.stringify({...plan,criteria:{...emptySearch,...invalid}})))
  }
})

test('social links canonicalize recognized videos and never allow arbitrary embed origins', () => {
  for (const input of ['https://youtu.be/dQw4w9WgXcQ?si=tracking','https://www.youtube.com/shorts/dQw4w9WgXcQ']) {
    const result=parseSocialVideo(input)
    assert.equal(result.url,'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    assert.equal(new URL(result.embed).hostname,'www.youtube-nocookie.com')
    assert.deepEqual(videoColumns({url:input,poster:''}),{video_url:null,video_poster_url:null,social_video_url:result.url})
  }
  assert.equal(parseSocialVideo('https://instagram.com/reel/ABC_12/?igsh=tracking').embed,'https://www.instagram.com/reel/ABC_12/embed/')
  assert.equal(parseSocialVideo('https://facebook.com/watch?v=123').url,'https://www.facebook.com/watch/?v=123')
  assert.equal(parseSocialVideo('https://www.facebook.com/person/videos/123/').provider,'Facebook')
  assert.equal(parseSocialVideo('https://fb.watch/Abc12/').embed,null)
  for (const input of ['http://youtu.be/dQw4w9WgXcQ','javascript:alert(1)','https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ','https://evil.test@youtube.com/watch?v=dQw4w9WgXcQ','https://youtube.com/redirect?q=https://evil.test','https://instagram.com/some-profile/','https://facebook.com/login.php']) assert.equal(parseSocialVideo(input),null,input)
})
