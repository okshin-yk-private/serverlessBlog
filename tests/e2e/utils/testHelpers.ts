import { Page } from '@playwright/test';

/**
 * E2Eテスト用ヘルパー関数
 * テスト全体で共通して使用するユーティリティ機能を提供
 *
 * Requirements:
 * - R44: テストデータ管理
 */

/**
 * すべてのストレージとCookieをクリア
 */
export async function clearAllStorage(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.context().clearCookies();
}
