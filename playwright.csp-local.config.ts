import { defineConfig, devices } from '@playwright/test';

// Deliberately no AWS global setup/teardown and no externally configurable URL.
export default defineConfig({
  testDir: './tests/e2e/csp-local',
  workers: 1,
  retries: 0,
  timeout: 60000,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:4317',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node scripts/csp/preview.mjs',
    url: 'http://127.0.0.1:4317',
    reuseExistingServer: false,
  },
});
