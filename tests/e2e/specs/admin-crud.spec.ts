import { test, expect } from '../fixtures';

/**
 * 管理画面CRUD操作の最小限E2Eテスト
 *
 * 最も重要なユーザーフロー（作成→編集→削除）を1つのテストで検証
 * 詳細なバリデーションやエラーハンドリングはユニットテスト・統合テストで実施済み
 *
 * Requirements:
 * - R43: UI E2Eテスト（最小限）（管理画面CRUD統合フロー）
 * - R40-42: 100%テストカバレッジ
 *
 * Test Strategy:
 * - 最小限のE2Eテストとして、ハッピーパスの基本フローのみを検証
 * - 作成→編集→削除の一連のフローを1つのテストで効率的に検証
 * - エッジケースや詳細な動作検証は他のテストレイヤーで実施済み
 */

test.describe('Admin CRUD Integration Flow', () => {
  const testCredentials = {
    email: process.env.TEST_ADMIN_EMAIL || 'admin@example.com',
    password: process.env.TEST_ADMIN_PASSWORD || 'testpassword',
  };

  test('should complete essential CRUD operations: create → edit → delete', async ({
    page,
    adminLoginPage,
    adminDashboardPage,
    adminPostCreatePage,
    adminPostEditPage,
  }) => {
    // ログイン
    await adminLoginPage.navigate();
    await adminLoginPage.clearCredentials();
    await adminLoginPage.login(testCredentials.email, testCredentials.password);
    await page.waitForURL('**/dashboard', { timeout: 10000 });

    // ==================== 記事作成 ====================
    await adminDashboardPage.navigate();
    await adminDashboardPage.clickNewPostButton();
    await page.waitForURL('**/posts/new', { timeout: 10000 });

    await adminPostCreatePage.fillTitle('E2E Test Article');
    await adminPostCreatePage.fillContent('これはE2Eテスト用の記事です。');
    await adminPostCreatePage.selectCategory('Technology');
    await adminPostCreatePage.clickSaveButton();

    await page.waitForURL('**/posts', { timeout: 10000 });
    await adminDashboardPage.waitForArticleListLoaded();

    // 作成した記事が表示されることを確認
    expect(await adminDashboardPage.isArticleVisible('E2E Test Article')).toBeTruthy();

    // ==================== 記事編集 ====================
    await adminDashboardPage.clickEditButtonForArticle('E2E Test Article');
    await page.waitForURL('**/posts/edit/*', { timeout: 10000 });

    await adminPostEditPage.fillTitle('E2E Test Article (Updated)');
    await adminPostEditPage.fillContent('これは更新されたE2Eテスト用の記事です。');
    await adminPostEditPage.clickSaveButton();

    await page.waitForURL('**/posts', { timeout: 10000 });
    await adminDashboardPage.waitForArticleListLoaded();

    // 更新された記事が表示され、元のタイトルが消えていることを確認
    expect(await adminDashboardPage.isArticleVisible('E2E Test Article (Updated)')).toBeTruthy();
    expect(await adminDashboardPage.isArticleVisible('E2E Test Article')).toBeFalsy();

    // ==================== 記事削除 ====================
    await adminDashboardPage.clickDeleteButtonForArticle('E2E Test Article (Updated)');
    expect(await adminDashboardPage.isDeleteConfirmDialogVisible()).toBeTruthy();
    await adminDashboardPage.confirmDelete();

    // 削除後、記事が一覧から消えていることを確認
    await page.waitForTimeout(1000);
    expect(await adminDashboardPage.isArticleVisible('E2E Test Article (Updated)')).toBeFalsy();
  });
});
