import { defineConfig, devices } from '@playwright/test';
import { env } from 'node:process';

// Tests run against an isolated guest-only Vite server, never the configured staging project.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(env.CI),
  retries: env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4175',
    trace: 'retain-on-failure',
    launchOptions: env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ['--no-sandbox'] }
      : {},
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],
  webServer: [
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 4175 --strictPort',
      url: 'http://127.0.0.1:4175',
      reuseExistingServer: false,
      env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '' },
      timeout: 60000,
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 4176 --strictPort',
      url: 'http://127.0.0.1:4176',
      reuseExistingServer: false,
      env: { VITE_SUPABASE_URL: 'https://auratrack-browser-tests.invalid', VITE_SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key' },
      timeout: 60000,
    },
  ],
});
