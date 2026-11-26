import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.BETRAYALS_TEST_URL ?? 'http://127.0.0.1:4199/the-big-eye-betrayals/'

export default defineConfig({
  testDir: './e2e/playwright',
  workers: 1,
  timeout: 40000,
  use: { baseURL, screenshot: 'only-on-failure' },
  projects: [
    {
      name: 'game-flow',
      testMatch: 'betrayals-opening.spec.ts',
      use: { browserName: 'chromium' },
    },
    {
      name: 'android-viewport',
      testMatch: 'betrayals-viewport.spec.ts',
      use: { ...devices['Pixel 7'], browserName: 'chromium' },
    },
    {
      name: 'ios-viewport',
      testMatch: 'betrayals-viewport.spec.ts',
      use: { ...devices['iPhone 13'], browserName: 'webkit' },
    },
  ],
  webServer: process.env.BETRAYALS_TEST_URL
    ? undefined
    : {
        command: 'npm run preview -- --host 127.0.0.1 --port 4199 --strictPort',
        url: baseURL,
        timeout: 45000,
        reuseExistingServer: false,
      },
})
