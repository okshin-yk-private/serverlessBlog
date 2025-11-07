import { test, expect } from '../fixtures';

/**
 * 管理画面未認証アクセスの最小限E2Eテスト
 *
 * このテストは重要なセキュリティフローのみを検証します：
 * - 未認証時のログインページへのリダイレクト
 *
 * 詳細なセキュリティテストは統合テスト・ユニットテストで実施済みです。
 *
 * Requirements:
 * - R43: UI E2Eテスト（最小限）（セキュリティ: 未認証アクセス）
 */

test.describe('Admin Unauthorized Access - Minimal E2E', () => {
  test('should redirect to login when accessing admin pages without auth', async ({ page }) => {
    // Arrange: ストレージをクリアして未認証状態にする
    // まずホームページに移動してからストレージをクリア
    await page.goto('/');
    await page.context().clearCookies();
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    // Act: 認証が必要なページにアクセス
    await page.goto('/dashboard');

    // Assert: ログインページにリダイレクトされることを確認
    await page.waitForURL('**/login', { timeout: 10000 });
    expect(page.url()).toContain('/login');
  });
});
