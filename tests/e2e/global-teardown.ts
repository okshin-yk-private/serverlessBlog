/**
 * Playwright Global Teardown
 *
 * E2Eテスト実行後のグローバルクリーンアップ
 * - MSW環境: 特になし（インメモリデータは自動破棄）
 * - AWS環境: [E2E-TEST] prefixのテストデータを自動クリーンアップ
 *
 * AWS 環境の認証は admin SPA と同じ経路を通す: 実 UI でログインし
 * (Amplify SRP → Cognito)、SPA が sessionStorage に置いた ID トークンで
 * admin API を呼ぶ。旧実装の POST /auth/login は実環境に存在しない
 * (Issue #678 で auth Lambda ごと撤去、App Client も USER_PASSWORD_AUTH を
 * 許可しない) ため、掃除は常に skip されていた。
 *
 * Requirements:
 * - R43: Playwright E2Eテスト
 * - R44: テストデータ管理
 */

import { chromium, request, FullConfig } from '@playwright/test';
import { AdminLoginPage } from './pages/AdminLoginPage';
import {
  ADMIN_SESSION_TOKEN_KEY,
  E2E_TEST_PREFIX,
  cleanupE2ETestData,
} from './utils/awsCleanup';

// MSWモックが有効かどうかを判定
const isMSWEnabled = process.env.VITE_ENABLE_MSW_MOCK !== 'false';

/**
 * admin SPA のベース URL。playwright.aws.config.ts の admin-chromium と同じ解決規則
 * (--project で絞った実行でも同じ値になるよう、見つからなければ env から組み立てる)。
 */
function resolveAdminBaseURL(config: FullConfig): string {
  const fromProject = config.projects.find((p) => p.name === 'admin-chromium')
    ?.use.baseURL;
  const url =
    fromProject ||
    process.env.ADMIN_BASE_URL ||
    `${process.env.BASE_URL || 'http://localhost:5173'}/admin`;
  return url.replace(/\/*$/, '/');
}

/**
 * ID トークンを取得する。取得できなければ理由をログに出して null。
 * TOTP が必須のユーザー (prd の MFA ON 等) はここでダッシュボードに到達しない。
 */
async function obtainIdToken(
  adminBaseURL: string,
  email: string,
  password: string
): Promise<string | null> {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      baseURL: adminBaseURL,
      // DEV の CloudFront Basic 認証。extraHTTPHeaders と違いオリジンを限定でき、
      // Cognito へのリクエストに Basic 認証情報を載せない。
      httpCredentials:
        process.env.DEV_BASIC_AUTH_USERNAME &&
        process.env.DEV_BASIC_AUTH_PASSWORD
          ? {
              username: process.env.DEV_BASIC_AUTH_USERNAME,
              password: process.env.DEV_BASIC_AUTH_PASSWORD,
              origin: new URL(adminBaseURL).origin,
            }
          : undefined,
    });
    const page = await context.newPage();
    const loginPage = new AdminLoginPage(page);
    await loginPage.navigate();
    try {
      await loginPage.login(email, password);
    } catch {
      // clickLogin はダッシュボード到達・エラー表示のどちらも起きないと reject する
    }
    if (!new URL(page.url()).pathname.endsWith('/dashboard')) {
      console.warn(
        `⚠️  Admin login did not reach the dashboard (at ${new URL(page.url()).pathname}).` +
          ' Wrong credentials or an MFA (TOTP) challenge is likely.'
      );
      return null;
    }
    return await page.evaluate(
      (key) => sessionStorage.getItem(key),
      ADMIN_SESSION_TOKEN_KEY
    );
  } finally {
    await browser.close();
  }
}

async function cleanupAwsTestData(config: FullConfig): Promise<void> {
  console.log(`🗑️  Cleaning up test data with prefix: ${E2E_TEST_PREFIX}`);

  // 実 Cognito に admin@example.com 等の MSW 用デフォルトは存在しないので使わない
  const email = process.env.TEST_ADMIN_EMAIL;
  const password = process.env.TEST_ADMIN_PASSWORD;
  if (!email || !password) {
    console.warn(
      '⚠️  TEST_ADMIN_EMAIL/TEST_ADMIN_PASSWORD not set. Skipping test data removal.'
    );
    return;
  }

  const adminBaseURL = resolveAdminBaseURL(config);
  // admin SPA は VITE_API_URL=/api (同一オリジンの CloudFront /api/* behavior)。
  // /api/* には Basic 認証が掛かっていない。
  const apiBase = new URL(
    process.env.VITE_API_BASE_URL || '/api',
    adminBaseURL
  ).href.replace(/\/+$/, '');

  const idToken = await obtainIdToken(adminBaseURL, email, password);
  if (!idToken) {
    console.warn(
      '⚠️  Could not authenticate for cleanup. Skipping test data removal.'
    );
    return;
  }

  // ブラウザの fetch ではなく独立した APIRequestContext を使う。Basic 認証を
  // extraHTTPHeaders で付けた context だと Authorization: Bearer が上書きされうる。
  const http = await request.newContext();
  try {
    const result = await cleanupE2ETestData(http, apiBase, idToken);
    for (const title of result.deletedPosts) {
      console.log(`  ✅ Deleted: ${title}`);
    }
    for (const name of result.deletedCategories) {
      console.log(`  ✅ Deleted category: ${name}`);
    }
    if (result.deletedPosts.length + result.deletedCategories.length === 0) {
      console.log('✅ No test data to clean up');
    }
    if (result.failures.length > 0) {
      console.warn(
        `⚠️  ${result.failures.length} deletion(s) failed: ${result.failures.join(', ')}`
      );
    }
  } finally {
    await http.dispose();
  }
}

async function globalTeardown(config: FullConfig) {
  console.log('\n🧹 E2E Test Global Teardown Starting...');

  if (!isMSWEnabled) {
    try {
      await cleanupAwsTestData(config);
    } catch (error) {
      console.warn('⚠️  Cleanup failed:', error);
      console.log('   Manual cleanup may be required');
    }
  }

  console.log('✅ E2E Test Global Teardown Complete');
}

export default globalTeardown;
