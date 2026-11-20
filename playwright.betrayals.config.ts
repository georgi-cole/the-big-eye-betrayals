import { defineConfig } from '@playwright/test'

const baseURL = process.env.BETRAYALS_TEST_URL ?? 'http://127.0.0.1:4199/the-big-eye-betrayals/'

export default defineConfig({
  testDir: './e2e/playwright',
  testMatch: 'betrayals-opening.spec.ts',
  workers: 1,
  timeout: 40000,
  use: { baseURL, browserName: 'chromium', screenshot: 'only-on-failure' },
  webServer: process.env.BETRAYALS_TEST_URL
    ? undefined
    : {
        command: 'npm run preview -- --host 127.0.0.1 --port 4199 --strictPort',
        url: baseURL,
        timeout: 45000,
        reuseExistingServer: false,
      },
})
