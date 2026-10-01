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

import { request, FullConfig } from '@playwright/test';
import { E2E_TEST_PREFIX, cleanupE2ETestData } from './utils/awsCleanup';
import {
  basicAuthFromEnv,
  obtainIdToken,
  resolveAdminBaseURL,
  resolveApiBase,
} from './utils/adminAuth';

// MSWモックが有効かどうかを判定
const isMSWEnabled = process.env.VITE_ENABLE_MSW_MOCK !== 'false';

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
  const apiBase = resolveApiBase(adminBaseURL);

  const idToken = await obtainIdToken(adminBaseURL, email, password, {
    basicAuth: basicAuthFromEnv(),
  });
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
