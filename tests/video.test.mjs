import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTs } from './helpers/load-ts.mjs'
const { videoFileError, MAX_VIDEO_BYTES } = loadTs('src/lib/propertyVideo.ts')

test('video picker rejects wrong types, empty files and oversized uploads before starting a transfer', () => {
  assert.equal(videoFileError({ type: 'video/mp4', size: MAX_VIDEO_BYTES }), null)
  assert.equal(videoFileError({ type: 'video/webm', size: 1 }), null)
  assert.equal(videoFileError({ type: 'video/mp4', size: MAX_VIDEO_BYTES + 1 }), 'video.tooLarge')
  for (const type of ['text/html', 'image/jpeg', 'video/quicktime', '']) {
    assert.equal(videoFileError({ type, size: 100 }), 'video.invalidType')
  }
  assert.equal(videoFileError({ type: 'video/mp4', size: 0 }), 'video.invalidType')
})
