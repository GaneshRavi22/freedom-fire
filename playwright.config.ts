import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : 'list',

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },

  // Serve the Expo web export before running tests.
  // Run `npx expo export --platform web` first to populate dist/.
  webServer: {
    command: 'npx serve dist -l 3000',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 15_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
