import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright UI E2E Test (Minimal) Configuration - Admin Panel
 * 管理画面のUI E2Eテスト（最小限）設定
 *
 * 変更履歴 (2025-11-07):
 * - クロスブラウザテスト削除（Mobile, Tablet削除）
 * - Chromiumのみでテスト実行（実行時間80%削減）
 *
 * Requirements:
 * - R43: UI E2Eテスト（最小限）環境（管理画面）
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
    ['list'],
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
    // CI環境でのReactハイドレーション遅延に対応するため延長
    actionTimeout: 30000,
    navigationTimeout: 30000,
  },

  // グローバルタイムアウト
  timeout: 90000,
  expect: {
    timeout: 30000,
  },

  // プロジェクト設定（Chromiumのみ - 2025-11-07変更）
  // モバイル・タブレットテストは削除
  // レスポンシブ対応検証はコンポーネントテストでカバー
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // ヘッドレスモード（環境変数で切り替え可能）
        headless: process.env.HEADLESS !== 'false',
      },
    },
  ],

  // テスト出力ディレクトリ
  outputDir: 'test-results-admin/',

  // Webサーバー設定（管理画面用）
  // E2Eテスト時にMSWモックを有効化
  // --mode testでviteを実行し、.env.testファイルから環境変数を読み込む
  webServer: {
    command: 'cd frontend/admin && npm run dev:e2e',
    url: 'http://localhost:3001',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
