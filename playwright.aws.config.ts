import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright Configuration for AWS Environment E2E Tests
 *
 * このファイルは、実際のAWS環境（dev/prd）に対してE2Eテストを実行するための設定です。
 * MSWモックは無効化され、実際のバックエンドAPIに対してテストを実行します。
 *
 * 使用方法:
 * - ローカル: BASE_URL=https://your-dev-site.com bun run test:e2e:aws
 * - GitHub Actions: 自動的に環境変数が設定されます
 *
 * テストデータ:
 * - テストデータは [E2E-TEST] prefixで作成される
 * - global-teardownで自動クリーンアップされる
 */

export default defineConfig({
  testDir: './tests/e2e',

  // グローバルセットアップ・ティアダウン（テストデータ管理）
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',

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

    // DEV環境Basic認証（playwright.config.ts:67-74を参考）
    // GitHub Actions環境変数から認証情報を取得してBase64エンコード
    extraHTTPHeaders:
      process.env.DEV_BASIC_AUTH_USERNAME && process.env.DEV_BASIC_AUTH_PASSWORD
        ? {
            Authorization: `Basic ${Buffer.from(
              `${process.env.DEV_BASIC_AUTH_USERNAME}:${process.env.DEV_BASIC_AUTH_PASSWORD}`
            ).toString('base64')}`,
          }
        : undefined,
  },

  // プロジェクト設定（Public / Admin を分離 - AWS環境のパス構造に対応）
  // AWS環境: Public は BASE_URL、Admin は BASE_URL/admin（CloudFront配信）
  projects: [
    {
      // Public サイト用プロジェクト（home.spec.ts, article.spec.ts）
      name: 'chromium',
      testMatch: ['**/home.spec.ts', '**/article.spec.ts'],
      use: {
        ...devices['Desktop Chrome'],
        contextOptions: {
          storageState: process.env.STORAGE_STATE,
        },
      },
    },
    {
      // Admin サイト用プロジェクト（admin-*.spec.ts）
      // AWS環境ではCloudFrontの /admin/ パス配下で配信される
      name: 'admin-chromium',
      // 実 AWS 環境で通せるのは現状 admin-auth のみ:
      // - 他の admin spec は MSW のシードデータ/リセット API を前提としており、
      //   実環境ではデータ前提が成立しない
      // - 有効な Cognito 認証情報 (TEST_ADMIN_EMAIL/PASSWORD) も CI に未整備
      // 全 spec の実環境対応は Issue #520 で扱う。ローカル MSW での全 spec 実行は
      // playwright.admin.config.ts が担当しており、この絞り込みの影響を受けない。
      testMatch: ['**/admin-auth.spec.ts'],
      use: {
        ...devices['Desktop Chrome'],
        // ADMIN_BASE_URL が設定されている場合はそれを使用、
        // 未設定の場合は BASE_URL/admin にフォールバック。
        // 相対パス解決で /admin プレフィックスが保持されるよう、
        // 末尾スラッシュを必ず付ける (BasePage.goto と対になる仕様)。
        baseURL: (
          process.env.ADMIN_BASE_URL ||
          `${process.env.BASE_URL || 'http://localhost:5173'}/admin`
        ).replace(/\/*$/, '/'),
        contextOptions: {
          storageState: process.env.STORAGE_STATE,
        },
      },
    },
  ],

  // Webサーバー設定（AWS環境テストでは不要 - 実際のデプロイ済みサイトにアクセス）
  // webServer: undefined,
});
