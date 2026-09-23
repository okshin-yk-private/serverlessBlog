import { defineConfig } from '@playwright/test';
// Real Amplify + browser WebAuthn; AWS HTTP responses are intercepted in tests.
export default defineConfig({
  testDir: './tests/e2e/passkeys',
  workers: 1,
  timeout: 30000,
  // Vite's local CSP lacks Cognito connect-src; AWS calls remain fully intercepted.
  use: { baseURL: 'http://localhost:4317', headless: true, bypassCSP: true },
  outputDir: 'test-results-passkeys',
  reporter: 'list',
  webServer: {
    command:
      'cd frontend/admin && bun run dev --host localhost --port 4317 --strictPort',
    url: 'http://localhost:4317',
    reuseExistingServer: false,
    env: {
      VITE_ENABLE_MSW_MOCK: 'false',
      VITE_ENABLE_PASSKEY: 'true',
      VITE_MFA_REQUIRED: 'true',
      VITE_COGNITO_USER_POOL_ID: 'ap-northeast-1_fixture',
      VITE_COGNITO_USER_POOL_CLIENT_ID: 'fixtureclient',
      VITE_API_URL: '/api',
    },
  },
});
