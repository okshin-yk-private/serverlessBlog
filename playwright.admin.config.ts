import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E Test Configuration - Admin Panel
 * 管理画面のE2Eテスト設定
 *
 * Requirements:
 * - R43: Playwright E2Eテスト環境（管理画面）
 * - R44: テストデータ管理
 */

export default defineConfig({
  // テストディレクトリ
  testDir: './tests/e2e',

  // 管理画面テストのみを実行
  testMatch: '**/admin-*.spec.ts',

  // グローバルセットアップ・ティアダウン
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',

  // 並列実行設定
  fullyParallel: true,

  // CI環境での失敗時リトライ
  retries: process.env.CI ? 2 : 0,

  // 並列実行ワーカー数（CI環境でも並列実行でテスト時間を短縮）
  workers: process.env.CI ? 4 : undefined,

  // レポーター設定
  reporter: [
    ['html', { outputFolder: 'playwright-report-admin' }],
    ['json', { outputFile: 'test-results/results-admin.json' }],
    ['list']
  ],

  // 共通設定
  use: {
    // ベースURL（管理画面用）
    baseURL: process.env.ADMIN_BASE_URL || 'http://localhost:3001',

    // トレース設定（失敗時のみ）
    trace: 'on-first-retry',

    // スクリーンショット設定（失敗時のみ）
    screenshot: 'only-on-failure',

    // ビデオ録画設定（失敗時のみ）
    video: 'retain-on-failure',

    // ブラウザコンテキスト設定
    viewport: { width: 1280, height: 720 },

    // タイムアウト設定
    actionTimeout: 10000,
    navigationTimeout: 30000,
  },

  // グローバルタイムアウト
  timeout: 60000,
  expect: {
    timeout: 10000,
  },

  // プロジェクト設定（ブラウザ別）
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // ヘッドレスモード（環境変数で切り替え可能）
        headless: process.env.HEADLESS !== 'false',
      },
    },

    // モバイルデバイス設定（レスポンシブ対応検証用）
    {
      name: 'mobile-chrome',
      use: {
        ...devices['Pixel 5'],
        headless: process.env.HEADLESS !== 'false',
      },
    },

    // タブレット設定
    {
      name: 'tablet',
      use: {
        ...devices['iPad Pro'],
        headless: process.env.HEADLESS !== 'false',
      },
    },
  ],

  // テスト出力ディレクトリ
  outputDir: 'test-results-admin/',

  // Webサーバー設定（管理画面用）
  // E2Eテスト時にMSWモックを有効化
  webServer: {
    command: '(cd frontend/admin && npm run dev)',
    url: 'http://localhost:3001',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    env: {
      VITE_ENABLE_MSW_MOCK: 'true',
    },
  },
});
