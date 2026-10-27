import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('startup removes legacy private caches while retaining the current public image cache', async () => {
  const startup = await readFile('src/main.tsx', 'utf8')
  const cleanup = startup.slice(startup.indexOf("if ('caches'"), startup.indexOf('createRoot(document'))
  const stored = new Set(['supabase-api', 'supabase-images', 'public-hotel-images-v2'])
  const caches = { delete: async name => stored.delete(name) }
  new Function('window', 'caches', cleanup)({ caches }, caches)
  assert.deepEqual([...stored], ['public-hotel-images-v2'])
})
