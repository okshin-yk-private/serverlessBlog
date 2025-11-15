import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright Configuration for AWS Environment E2E Tests
 *
 * このファイルは、実際のAWS環境（dev/prd）に対してE2Eテストを実行するための設定です。
 * MSWモックは無効化され、実際のバックエンドAPIに対してテストを実行します。
 *
 * 使用方法:
 * - ローカル: BASE_URL=https://your-public-site.com npx playwright test --config=playwright.aws.config.ts
 * - GitHub Actions: 自動的に環境変数が設定されます
 */

export default defineConfig({
  testDir: './tests/e2e',

  // テストタイムアウト（実AWS環境ではネットワーク遅延を考慮）
  timeout: 60 * 1000,
  expect: {
    timeout: 10 * 1000,
  },

  // 並列実行設定
  fullyParallel: true,

  // リトライ設定（実AWS環境では1回リトライ）
  retries: process.env.CI ? 1 : 0,

  // ワーカー数（CI環境では1、ローカルでは並列実行）
  workers: process.env.CI ? 1 : undefined,

  // レポーター設定
  reporter: [
    ['html', { outputFolder: 'playwright-report-aws' }],
    ['json', { outputFile: 'test-results/results-aws.json' }],
    ['junit', { outputFile: 'test-results/junit-aws.xml' }],
    ['list'],
  ],

  // テスト失敗時の動作
  use: {
    // ベースURL（環境変数から取得）
    baseURL: process.env.BASE_URL || 'http://localhost:5173',

    // トレース設定（失敗時のみ）
    trace: 'retain-on-failure',

    // スクリーンショット（失敗時のみ）
    screenshot: 'only-on-failure',

    // ビデオ録画（失敗時のみ）
    video: 'retain-on-failure',

    // ネットワーク遅延考慮
    navigationTimeout: 30 * 1000,
    actionTimeout: 15 * 1000,
  },

  // プロジェクト設定（Chromiumのみ - 最小限E2Eテスト戦略）
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // 実AWS環境のため、MSWモックは無効化
        contextOptions: {
          // 認証情報の永続化（セッション維持）
          storageState: process.env.STORAGE_STATE,
        },
      },
    },
  ],

  // Webサーバー設定（AWS環境テストでは不要 - 実際のデプロイ済みサイトにアクセス）
  // webServer: undefined,
});
