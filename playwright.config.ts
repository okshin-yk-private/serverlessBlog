import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright UI E2E Test (Minimal) Configuration
 * サーバーレスブログシステムのUI E2Eテスト（最小限）設定
 *
 * 変更履歴 (2025-11-07):
 * - クロスブラウザテスト削除（Firefox, WebKit, Mobile削除）
 * - Chromiumのみでテスト実行（実行時間80%削減）
 *
 * Requirements:
 * - R43: UI E2Eテスト（最小限）環境
 * - R44: テストデータ管理
 */

export default defineConfig({
  // テストディレクトリ
  testDir: './tests/e2e',

  // 管理画面テストを除外（別の設定ファイルで実行）
  testIgnore: '**/admin-*.spec.ts',

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
    ['html', { outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['list'],
  ],

  // 共通設定
  use: {
    // ベースURL（環境変数で切り替え可能）
    baseURL: process.env.BASE_URL || 'http://localhost:3000',

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

    // DEV環境Basic認証（Task 4.3.3）
    // GitHub Actions環境変数から認証情報を取得してBase64エンコード
    // Requirement R47: DEV環境Basic認証機能
    extraHTTPHeaders:
      process.env.DEV_BASIC_AUTH_USERNAME && process.env.DEV_BASIC_AUTH_PASSWORD
        ? {
            Authorization: `Basic ${Buffer.from(
              `${process.env.DEV_BASIC_AUTH_USERNAME}:${process.env.DEV_BASIC_AUTH_PASSWORD}`
            ).toString('base64')}`,
          }
        : undefined,
  },

  // グローバルタイムアウト
  timeout: 60000,
  expect: {
    timeout: 10000,
  },

  // プロジェクト設定（Chromiumのみ - 2025-11-07変更）
  // クロスブラウザテスト（Firefox, WebKit, Mobile）は削除
  // 詳細な動作検証はユニットテスト・統合テストでカバー
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
  outputDir: 'test-results/',

  // Webサーバー設定（ローカル開発用）
  // E2Eテスト時にMSWモックを有効化
  webServer: {
    command: '(cd frontend/public && npm run dev)',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    env: {
      VITE_ENABLE_MSW_MOCK: 'true',
    },
  },
});
