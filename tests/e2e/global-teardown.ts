/**
 * Playwright Global Teardown
 *
 * E2Eテスト実行後のグローバルクリーンアップ
 *
 * Requirements:
 * - R43: Playwright E2Eテスト
 * - R44: テストデータ管理
 */

import { FullConfig } from '@playwright/test';

async function globalTeardown(config: FullConfig) {
  console.log('\n🧹 E2E Test Global Teardown Starting...');

  // クリーンアップ処理（必要に応じて）
  // 例: テストデータベースのクリーンアップ、テストファイルの削除など

  console.log('✅ E2E Test Global Teardown Complete');
}

export default globalTeardown;
