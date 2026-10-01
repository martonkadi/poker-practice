import { defineConfig, devices } from '@playwright/test';
// Release runs serve the existing production build in `dist/` with the
// headers from `dist/_headers` applied (tools/serve-dist.mjs). The web server
// never rebuilds, so the browser suite tests the exact artifact that deploys.
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45_000,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } }
  ],
  webServer: {
    command: 'node tools/serve-dist.mjs --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173', reuseExistingServer: false, timeout: 30_000
  }
});
