import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  fullyParallel: false,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:4174', serviceWorkers: 'block', trace: 'off' },
  webServer: {
    cwd: '../..',
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4174 --strictPort',
    url: 'http://127.0.0.1:4174',
    env: { VITE_SUPABASE_URL: 'https://booking.test', VITE_SUPABASE_ANON_KEY: 'test-anon-key' },
    reuseExistingServer: true,
  },
})
