import { test, expect } from '../fixtures';

/**
 * 管理画面認証フローの最小限E2Eテスト
 *
 * このテストは重要なユーザーフローのみを検証します：
 * - ログイン成功フロー
 * - ログイン失敗フロー
 *
 * 詳細なバリデーションやエラーハンドリングは統合テスト・ユニットテストで実施済みです。
 *
 * Requirements:
 * - R43: UI E2Eテスト（最小限）（管理者認証フロー）
 */

test.describe('Admin Authentication - Minimal E2E', () => {
  // テスト用の認証情報
  const testCredentials = {
    email: process.env.TEST_ADMIN_EMAIL || 'admin@example.com',
    password: process.env.TEST_ADMIN_PASSWORD || 'testpassword',
  };

  test.beforeEach(async ({ adminLoginPage }) => {
    // 各テスト前にログインページに移動
    await adminLoginPage.navigate();
    // ストレージをクリアして認証状態をリセット
    await adminLoginPage.clearCredentials();
  });

  test('should successfully login with valid credentials', async ({
    adminLoginPage,
    page,
  }) => {
    // Act: 有効な認証情報でログイン
    await adminLoginPage.login(testCredentials.email, testCredentials.password);

    // Assert: ダッシュボードにリダイレクトされることを確認
    await page.waitForURL('**/dashboard', { timeout: 10000 });
    expect(page.url()).toContain('/dashboard');
  });

  test('should show error message with invalid credentials', async ({
    adminLoginPage,
  }) => {
    // Arrange: 無効な認証情報
    const invalidCredentials = {
      email: 'invalid@example.com',
      password: 'wrongpassword',
    };

    // Act: 無効な認証情報でログイン
    await adminLoginPage.login(
      invalidCredentials.email,
      invalidCredentials.password
    );

    // Assert: エラーメッセージが表示されることを確認
    const isErrorVisible = await adminLoginPage.isErrorMessageVisible();
    expect(isErrorVisible).toBeTruthy();
  });
});
