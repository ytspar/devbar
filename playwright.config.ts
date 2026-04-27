import { defineConfig, devices } from '@playwright/test';

const screenshotMode = (process.env.E2E_SCREENSHOT_MODE ?? 'on') as
  | 'off'
  | 'on'
  | 'only-on-failure';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  // Increase timeout for visual tests
  timeout: 60000,
  expect: {
    // Allow some pixel differences for dynamic content (metrics, timestamps)
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.05, // 5% pixel difference allowed
      threshold: 0.3, // Color difference threshold
    },
  },
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: screenshotMode,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Mobile viewports
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 12'] },
    },
    // Tablet
    {
      name: 'tablet',
      use: { ...devices['iPad Mini'] },
    },
  ],
  webServer: {
    command: 'pnpm --filter playground dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
