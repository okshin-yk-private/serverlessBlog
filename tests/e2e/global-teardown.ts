/**
 * Playwright Global Teardown
 *
 * E2Eテスト実行後のグローバルクリーンアップ
 * - MSW環境: 特になし（インメモリデータは自動破棄）
 * - AWS環境: [E2E-TEST] prefixのテストデータを自動クリーンアップ
 *
 * Requirements:
 * - R43: Playwright E2Eテスト
 * - R44: テストデータ管理
 */

import { chromium, FullConfig } from '@playwright/test';

// テストデータ識別prefix
const E2E_TEST_PREFIX = '[E2E-TEST]';

// MSWモックが有効かどうかを判定
const isMSWEnabled = process.env.VITE_ENABLE_MSW_MOCK !== 'false';

async function globalTeardown(config: FullConfig) {
  console.log('\n🧹 E2E Test Global Teardown Starting...');

  if (!isMSWEnabled) {
    // AWS環境: テストデータのクリーンアップ
    console.log(`🗑️  Cleaning up test data with prefix: ${E2E_TEST_PREFIX}`);

    const baseURL = config.projects[0].use.baseURL || 'http://localhost:5173';
    const apiBaseURL = process.env.VITE_API_BASE_URL || '/api';

    try {
      const browser = await chromium.launch();
      const contextOptions: Record<string, unknown> = {};

      // Basic認証ヘッダーを設定
      if (
        process.env.DEV_BASIC_AUTH_USERNAME &&
        process.env.DEV_BASIC_AUTH_PASSWORD
      ) {
        contextOptions.extraHTTPHeaders = {
          Authorization: `Basic ${Buffer.from(
            `${process.env.DEV_BASIC_AUTH_USERNAME}:${process.env.DEV_BASIC_AUTH_PASSWORD}`
          ).toString('base64')}`,
        };
      }

      const context = await browser.newContext(contextOptions);
      const page = await context.newPage();

      // テスト用のログイン（認証トークン取得）
      const loginEmail = process.env.TEST_ADMIN_EMAIL || 'admin@example.com';
      const loginPassword = process.env.TEST_ADMIN_PASSWORD || 'testpassword';

      // まずベースURLにアクセスしてCookieやセッションを確立
      await page.goto(baseURL, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });

      // APIでログインしてトークンを取得
      const loginResponse = await page.evaluate(
        async ({
          apiBase,
          email,
          password,
        }: {
          apiBase: string;
          email: string;
          password: string;
        }) => {
          const resp = await fetch(`${apiBase}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
          });
          if (resp.ok) {
            return resp.json();
          }
          return null;
        },
        { apiBase: apiBaseURL, email: loginEmail, password: loginPassword }
      );

      if (!loginResponse || !loginResponse.token) {
        console.warn(
          '⚠️  Could not authenticate for cleanup. Skipping test data removal.'
        );
        await context.close();
        await browser.close();
        console.log('✅ E2E Test Global Teardown Complete');
        return;
      }

      const authToken = loginResponse.token;

      // 管理画面の記事一覧を取得してE2Eテストデータを検索
      const posts = await page.evaluate(
        async ({ apiBase, token }: { apiBase: string; token: string }) => {
          const resp = await fetch(`${apiBase}/admin/posts?limit=100`, {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          });
          if (resp.ok) {
            const data = await resp.json();
            return data.items || [];
          }
          return [];
        },
        { apiBase: apiBaseURL, token: authToken }
      );

      // [E2E-TEST] prefixの記事を削除
      const testPosts = posts.filter(
        (post: { title: string }) =>
          post.title && post.title.startsWith(E2E_TEST_PREFIX)
      );

      if (testPosts.length > 0) {
        console.log(`🗑️  Found ${testPosts.length} test post(s) to clean up`);
        for (const post of testPosts) {
          await page.evaluate(
            async ({
              apiBase,
              token,
              postId,
            }: {
              apiBase: string;
              token: string;
              postId: string;
            }) => {
              await fetch(`${apiBase}/admin/posts/${postId}`, {
                method: 'DELETE',
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              });
            },
            { apiBase: apiBaseURL, token: authToken, postId: post.id }
          );
          console.log(`  ✅ Deleted: ${post.title}`);
        }
      } else {
        console.log('✅ No test data to clean up');
      }

      await context.close();
      await browser.close();
    } catch (error) {
      console.warn('⚠️  Cleanup failed:', error);
      console.log('   Manual cleanup may be required');
    }
  }

  console.log('✅ E2E Test Global Teardown Complete');
}

export default globalTeardown;
