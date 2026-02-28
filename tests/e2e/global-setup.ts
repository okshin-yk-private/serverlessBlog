/**
 * Playwright Global Setup
 *
 * E2Eテスト実行前のグローバルセットアップ
 * - MSW環境: MSWワーカーの初期化とモックAPIの準備
 * - AWS環境: 実環境への接続確認
 *
 * Requirements:
 * - R43: Playwright E2Eテスト
 * - R44: テストデータ管理
 */

import { chromium, FullConfig } from '@playwright/test';
import { resetMockPosts } from './mocks/mockData';

// MSWモックが有効かどうかを判定
const isMSWEnabled = process.env.VITE_ENABLE_MSW_MOCK !== 'false';

async function globalSetup(config: FullConfig) {
  console.log('🚀 E2E Test Global Setup Starting...');
  console.log(`📋 Mode: ${isMSWEnabled ? 'MSW Mock' : 'AWS Real Environment'}`);

  if (isMSWEnabled) {
    // MSW環境: モックデータをリセットしてMSWワーカーを初期化
    resetMockPosts();
    console.log('✅ Mock data reset complete');

    const baseURL = config.projects[0].use.baseURL || 'http://localhost:3000';
    console.log(`📍 Base URL: ${baseURL}`);

    console.log('🌐 Initializing MSW worker...');
    const browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await page.goto(baseURL, { waitUntil: 'networkidle', timeout: 30000 });
      console.log('✅ MSW worker initialization complete');
    } catch (error) {
      console.warn('⚠️  Could not initialize MSW worker:', error);
      console.log('   Tests will proceed without MSW mock (may use real API)');
    } finally {
      await context.close();
      await browser.close();
    }
  } else {
    // AWS環境: 接続確認
    const baseURL = config.projects[0].use.baseURL || 'http://localhost:5173';
    console.log(`📍 Base URL: ${baseURL}`);
    console.log(
      '🔑 Basic Auth:',
      process.env.DEV_BASIC_AUTH_USERNAME ? 'configured' : 'not configured'
    );
    console.log('🌐 Testing connection to real environment...');

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

      const response = await page.goto(baseURL, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });

      if (response && response.ok()) {
        console.log('✅ Real environment connection successful');
      } else {
        console.warn(`⚠️  Unexpected response status: ${response?.status()}`);
      }

      await context.close();
      await browser.close();
    } catch (error) {
      console.warn('⚠️  Could not connect to real environment:', error);
      console.log('   Tests may fail if the environment is not accessible');
    }
  }

  console.log('✅ E2E Test Global Setup Complete\n');
}

export default globalSetup;
