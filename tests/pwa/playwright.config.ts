import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  workers: 1,
  outputDir: '../../tmp/pwa-artifacts',
  use: { baseURL: 'http://127.0.0.1:4175', serviceWorkers: 'allow', trace: 'retain-on-failure' },
  webServer: {
    cwd: '../..',
    command: 'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4175 --strictPort',
    url: 'http://127.0.0.1:4175',
    env: { VITE_SUPABASE_URL: 'https://booking.test', VITE_SUPABASE_ANON_KEY: 'test-anon-key' },
    reuseExistingServer: false,
  },
})
