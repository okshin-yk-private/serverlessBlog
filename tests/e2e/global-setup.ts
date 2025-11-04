/**
 * Playwright Global Setup
 *
 * E2Eテスト実行前のグローバルセットアップ
 * MSWワーカーの初期化とモックAPIの準備
 *
 * Requirements:
 * - R43: Playwright E2Eテスト
 * - R44: テストデータ管理
 */

import { chromium, FullConfig } from '@playwright/test';
import { resetMockPosts } from './mocks/mockData';

async function globalSetup(config: FullConfig) {
  console.log('🚀 E2E Test Global Setup Starting...');

  // モックデータのリセット
  resetMockPosts();
  console.log('✅ Mock data reset complete');

  // ベースURLの確認
  const baseURL = config.projects[0].use.baseURL || 'http://localhost:3000';
  console.log(`📍 Base URL: ${baseURL}`);

  // ブラウザを起動してMSWワーカーを初期化
  console.log('🌐 Initializing MSW worker...');
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // ベースURLに移動してMSWワーカーをインストール
    await page.goto(baseURL, { waitUntil: 'networkidle', timeout: 30000 });
    console.log('✅ MSW worker initialization complete');
  } catch (error) {
    console.warn('⚠️  Could not initialize MSW worker:', error);
    console.log('   Tests will proceed without MSW mock (may use real API)');
  } finally {
    await context.close();
    await browser.close();
  }

  console.log('✅ E2E Test Global Setup Complete\n');
}

export default globalSetup;
