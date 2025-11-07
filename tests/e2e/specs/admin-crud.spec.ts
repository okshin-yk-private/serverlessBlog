import { test, expect } from '../fixtures';

/**
 * 管理画面CRUD操作の統合E2Eテスト
 *
 * このテストは記事の作成・編集・削除の統合フローをカバーします。
 * 詳細なバリデーションやエラーハンドリングはユニットテスト・統合テストで実施済みです。
 *
 * Requirements:
 * - R43: UI E2Eテスト（最小限）（管理画面CRUD統合フロー）
 * - R40-42: 100%テストカバレッジ
 *
 * Test Strategy:
 * - UI E2Eテストは重要なユーザーフローのみを検証
 * - ハッピーパスと基本的な動作確認に焦点
 * - 詳細な動作検証は他のテストレイヤーで実施済み
 */

test.describe('Admin CRUD Integration Flow', () => {
  // テスト用の認証情報
  const testCredentials = {
    email: process.env.TEST_ADMIN_EMAIL || 'admin@example.com',
    password: process.env.TEST_ADMIN_PASSWORD || 'testpassword',
  };

  // テスト用の記事データ
  const testArticle = {
    title: 'E2E Test Article',
    content: 'これはE2Eテスト用の記事です。',
    category: 'Technology',
  };

  const updatedArticle = {
    title: 'E2E Test Article (Updated)',
    content: 'これは更新されたE2Eテスト用の記事です。',
  };

  test.beforeEach(async ({ adminLoginPage, page }) => {
    // 各テスト前にログイン
    await adminLoginPage.navigate();
    await adminLoginPage.clearCredentials();
    await adminLoginPage.login(testCredentials.email, testCredentials.password);
    // ダッシュボードへの遷移を待つ
    await page.waitForURL('**/dashboard', { timeout: 10000 });
  });

  test('should complete full CRUD flow: create → edit → delete', async ({
    page,
    adminDashboardPage,
    adminPostCreatePage,
    adminPostEditPage,
  }) => {
    // =====================================================
    // Phase 1: 記事作成
    // =====================================================

    // ダッシュボードに遷移していることを確認
    await page.waitForURL('**/dashboard', { timeout: 10000 });
    expect(page.url()).toContain('/dashboard');

    // 新規作成ボタンをクリック
    await adminDashboardPage.navigate();
    await adminDashboardPage.clickNewPostButton();

    // 記事作成ページに遷移していることを確認
    await page.waitForURL('**/posts/new', { timeout: 10000 });
    expect(page.url()).toContain('/posts/new');

    // 記事データを入力
    await adminPostCreatePage.fillTitle(testArticle.title);
    await adminPostCreatePage.fillContent(testArticle.content);
    await adminPostCreatePage.selectCategory(testArticle.category);

    // 記事を保存
    await adminPostCreatePage.clickSaveButton();

    // 記事一覧ページに戻ることを確認
    await page.waitForURL('**/posts', { timeout: 10000 });

    // 記事リストが完全に読み込まれるまで待機
    await adminDashboardPage.waitForArticleListLoaded();

    // =====================================================
    // Phase 2: 記事一覧で作成された記事を確認
    // =====================================================

    // 作成した記事が一覧に表示されることを確認
    const isArticleVisible = await adminDashboardPage.isArticleVisible(testArticle.title);
    expect(isArticleVisible).toBeTruthy();

    // =====================================================
    // Phase 3: 記事編集
    // =====================================================

    // 編集ボタンをクリック
    await adminDashboardPage.clickEditButtonForArticle(testArticle.title);

    // 記事編集ページに遷移していることを確認
    await page.waitForURL('**/posts/edit/*', { timeout: 10000 });
    expect(page.url()).toContain('/posts/edit/');

    // 記事データを更新
    await adminPostEditPage.fillTitle(updatedArticle.title);
    await adminPostEditPage.fillContent(updatedArticle.content);

    // 更新を保存
    await adminPostEditPage.clickSaveButton();

    // 記事一覧ページに戻ることを確認
    await page.waitForURL('**/posts', { timeout: 10000 });

    // 記事リストが完全に読み込まれるまで待機
    await adminDashboardPage.waitForArticleListLoaded();

    // =====================================================
    // Phase 4: 更新された記事を確認
    // =====================================================

    // 更新された記事が一覧に表示されることを確認
    const isUpdatedArticleVisible = await adminDashboardPage.isArticleVisible(
      updatedArticle.title
    );
    expect(isUpdatedArticleVisible).toBeTruthy();

    // 元のタイトルの記事は存在しないことを確認
    const isOldArticleVisible = await adminDashboardPage.isArticleVisible(testArticle.title);
    expect(isOldArticleVisible).toBeFalsy();

    // =====================================================
    // Phase 5: 記事削除
    // =====================================================

    // 削除ボタンをクリック
    await adminDashboardPage.clickDeleteButtonForArticle(updatedArticle.title);

    // 削除確認ダイアログが表示されることを確認
    const isConfirmDialogVisible = await adminDashboardPage.isDeleteConfirmDialogVisible();
    expect(isConfirmDialogVisible).toBeTruthy();

    // 削除を確定
    await adminDashboardPage.confirmDelete();

    // =====================================================
    // Phase 6: 削除された記事が一覧から消えていることを確認
    // =====================================================

    // ページがリロードされるまで待機
    await page.waitForTimeout(1000);

    // 削除された記事が一覧に表示されないことを確認
    const isDeletedArticleVisible = await adminDashboardPage.isArticleVisible(
      updatedArticle.title
    );
    expect(isDeletedArticleVisible).toBeFalsy();
  });

  test('should cancel article deletion', async ({
    page,
    adminDashboardPage,
    adminPostCreatePage,
  }) => {
    // =====================================================
    // 準備: テスト用記事を作成
    // =====================================================

    await adminDashboardPage.navigate();
    await adminDashboardPage.clickNewPostButton();

    await page.waitForURL('**/posts/new', { timeout: 10000 });

    await adminPostCreatePage.fillTitle(testArticle.title);
    await adminPostCreatePage.fillContent(testArticle.content);
    await adminPostCreatePage.selectCategory(testArticle.category);
    await adminPostCreatePage.clickSaveButton();

    await page.waitForURL('**/posts', { timeout: 10000 });

    // 記事リストが完全に読み込まれるまで待機
    await adminDashboardPage.waitForArticleListLoaded();

    // =====================================================
    // 削除キャンセルのテスト
    // =====================================================

    // 削除ボタンをクリック
    await adminDashboardPage.clickDeleteButtonForArticle(testArticle.title);

    // 削除確認ダイアログが表示されることを確認
    const isConfirmDialogVisible = await adminDashboardPage.isDeleteConfirmDialogVisible();
    expect(isConfirmDialogVisible).toBeTruthy();

    // 削除をキャンセル
    await adminDashboardPage.cancelDelete();

    // 記事が一覧に残っていることを確認
    const isArticleVisible = await adminDashboardPage.isArticleVisible(testArticle.title);
    expect(isArticleVisible).toBeTruthy();

    // クリーンアップ: テスト記事を削除
    await adminDashboardPage.clickDeleteButtonForArticle(testArticle.title);
    await adminDashboardPage.confirmDelete();
  });

  test('should create draft article and publish it', async ({
    page,
    adminDashboardPage,
    adminPostCreatePage,
    adminPostEditPage,
  }) => {
    // =====================================================
    // Phase 1: 下書き記事を作成
    // =====================================================

    await adminDashboardPage.navigate();
    await adminDashboardPage.clickNewPostButton();

    await page.waitForURL('**/posts/new', { timeout: 10000 });

    await adminPostCreatePage.fillTitle(testArticle.title);
    await adminPostCreatePage.fillContent(testArticle.content);
    await adminPostCreatePage.selectCategory(testArticle.category);

    // 下書きとして保存
    await adminPostCreatePage.setPublishStatus('draft');
    await adminPostCreatePage.clickSaveButton();

    await page.waitForURL('**/posts', { timeout: 10000 });

    // =====================================================
    // Phase 2: 下書き記事を確認
    // =====================================================

    // 下書きフィルターを適用
    await adminDashboardPage.filterByStatus('draft');

    // 記事リストが完全に読み込まれるまで待機
    await adminDashboardPage.waitForArticleListLoaded();

    // 下書き記事が表示されることを確認
    const isDraftVisible = await adminDashboardPage.isArticleVisible(testArticle.title);
    expect(isDraftVisible).toBeTruthy();

    // =====================================================
    // Phase 3: 下書きを公開
    // =====================================================

    // 編集ボタンをクリック
    await adminDashboardPage.clickEditButtonForArticle(testArticle.title);

    await page.waitForURL('**/posts/edit/*', { timeout: 10000 });

    // 公開ステータスに変更
    await adminPostEditPage.setPublishStatus('published');
    await adminPostEditPage.clickSaveButton();

    await page.waitForURL('**/posts', { timeout: 10000 });

    // =====================================================
    // Phase 4: 公開記事を確認
    // =====================================================

    // 公開済みフィルターを適用
    await adminDashboardPage.filterByStatus('published');

    // 記事リストが完全に読み込まれるまで待機
    await adminDashboardPage.waitForArticleListLoaded();

    // 公開記事が表示されることを確認
    const isPublishedVisible = await adminDashboardPage.isArticleVisible(testArticle.title);
    expect(isPublishedVisible).toBeTruthy();

    // クリーンアップ: テスト記事を削除
    await adminDashboardPage.clickDeleteButtonForArticle(testArticle.title);
    await adminDashboardPage.confirmDelete();
  });
});
