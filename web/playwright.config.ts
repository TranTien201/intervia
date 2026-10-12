import { defineConfig, devices } from '@playwright/test'

// E2E runs against the mock API (VITE_USE_MOCK=true). Each test gets a fresh context, so the
// mock DB (sessionStorage) starts from the seed.
export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://localhost:5174', trace: 'on-first-retry' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    // Phone size on Chromium, so only one browser needs installing.
    { name: 'mobile', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
  ],
  webServer: {
    command: 'VITE_USE_MOCK=true npx vite --port 5174 --strictPort',
    url: 'http://localhost:5174',
    reuseExistingServer: true,
  },
})
