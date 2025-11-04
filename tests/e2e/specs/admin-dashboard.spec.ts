import { test, expect, authenticatedTest } from '../fixtures';

/**
 * 管理画面ダッシュボードのE2Eテスト
 *
 * Requirements:
 * - R43: E2Eテスト（記事管理フロー）
 * - R40-42: 100%テストカバレッジ
 *
 * TDD Approach:
 * このテストは最初は失敗します（Red）
 * 管理画面ダッシュボードが実装されたら成功します（Green）
 */

authenticatedTest.describe('Admin Dashboard - Article List', () => {
  authenticatedTest.beforeEach(async ({ adminDashboardPage }) => {
    // 各テスト前にダッシュボードに移動
    await adminDashboardPage.navigate();
  });

  authenticatedTest('should display article list', async ({ adminDashboardPage }) => {
    // Arrange: ダッシュボードに移動済み

    // Act: 記事一覧が表示されているか確認
    const isVisible = await adminDashboardPage.isArticleListVisible();

    // Assert: 記事一覧が表示されていることを確認
    expect(isVisible).toBeTruthy();
  });

  authenticatedTest('should display article items', async ({ adminDashboardPage }) => {
    // Arrange: ダッシュボードに移動済み

    // Act: 記事数を取得
    const count = await adminDashboardPage.getArticleCount();

    // Assert: 少なくとも1つの記事が表示されていることを確認
    expect(count).toBeGreaterThan(0);
  });

  authenticatedTest('should display article title and status', async ({
    adminDashboardPage,
  }) => {
    // Arrange: ダッシュボードに移動済み

    // Act: 最初の記事のタイトルとステータスを取得
    const title = await adminDashboardPage.getArticleTitle(0);
    const status = await adminDashboardPage.getArticleStatus(0);

    // Assert: タイトルとステータスが表示されていることを確認
    expect(title).toBeTruthy();
    expect(status).toBeTruthy();
  });

  authenticatedTest('should navigate to new article page', async ({
    adminDashboardPage,
    page,
  }) => {
    // Arrange: ダッシュボードに移動済み

    // Act: 新規記事作成ボタンをクリック
    await adminDashboardPage.clickNewArticle();

    // Assert: 記事作成ページに遷移することを確認
    expect(page.url()).toContain('/posts/new');
  });
});

authenticatedTest.describe('Admin Dashboard - Article Search', () => {
  authenticatedTest.beforeEach(async ({ adminDashboardPage }) => {
    await adminDashboardPage.navigate();
  });

  authenticatedTest('should search articles by title', async ({ adminDashboardPage }) => {
    // Arrange: 検索対象の記事タイトルを取得
    const originalCount = await adminDashboardPage.getArticleCount();
    const searchTitle = await adminDashboardPage.getArticleTitle(0);

    // Act: タイトルで検索
    await adminDashboardPage.searchArticle(searchTitle);

    // Assert: 検索結果が表示されることを確認
    const hasArticle = await adminDashboardPage.hasArticleWithTitle(searchTitle);
    expect(hasArticle).toBeTruthy();
  });

  authenticatedTest('should show no results for non-existent title', async ({
    adminDashboardPage,
  }) => {
    // Arrange: 存在しないタイトルで検索
    const nonExistentTitle = 'この記事は存在しません12345';

    // Act: 存在しないタイトルで検索
    await adminDashboardPage.searchArticle(nonExistentTitle);

    // Assert: 記事が見つからないことを確認
    const count = await adminDashboardPage.getArticleCount();
    expect(count).toBe(0);
  });
});

authenticatedTest.describe('Admin Dashboard - Article Filtering', () => {
  authenticatedTest.beforeEach(async ({ adminDashboardPage }) => {
    await adminDashboardPage.navigate();
  });

  authenticatedTest('should filter articles by published status', async ({
    adminDashboardPage,
  }) => {
    // Arrange: ダッシュボードに移動済み

    // Act: 公開済みフィルターを選択
    await adminDashboardPage.selectFilter('公開済み');

    // Assert: すべての記事が公開済みであることを確認
    const allPublished = await adminDashboardPage.areAllArticlesInStatus('公開済み');
    expect(allPublished).toBeTruthy();
  });

  authenticatedTest('should filter articles by draft status', async ({
    adminDashboardPage,
  }) => {
    // Arrange: ダッシュボードに移動済み

    // Act: 下書きフィルターを選択
    await adminDashboardPage.selectFilter('下書き');

    // Assert: すべての記事が下書きであることを確認
    const allDraft = await adminDashboardPage.areAllArticlesInStatus('下書き');
    expect(allDraft).toBeTruthy();
  });
});

authenticatedTest.describe('Admin Dashboard - Article Actions', () => {
  authenticatedTest.beforeEach(async ({ adminDashboardPage }) => {
    await adminDashboardPage.navigate();
  });

  authenticatedTest('should navigate to edit page', async ({
    adminDashboardPage,
    page,
  }) => {
    // Arrange: ダッシュボードに移動済み

    // Act: 最初の記事の編集ボタンをクリック
    await adminDashboardPage.clickEditArticle(0);

    // Assert: 編集ページに遷移することを確認
    expect(page.url()).toContain('/posts/edit');
  });

  authenticatedTest('should edit article by title', async ({ adminDashboardPage, page }) => {
    // Arrange: 編集対象の記事タイトルを取得
    const targetTitle = await adminDashboardPage.getArticleTitle(0);

    // Act: タイトルで記事を検索して編集
    await adminDashboardPage.editArticleByTitle(targetTitle);

    // Assert: 編集ページに遷移することを確認
    expect(page.url()).toContain('/posts/edit');
  });

  authenticatedTest('should show delete confirmation dialog', async ({
    adminDashboardPage,
  }) => {
    // Arrange: ダッシュボードに移動済み

    // Act: 削除ボタンをクリック
    await adminDashboardPage.clickDeleteArticle(0);

    // Assert: 確認ダイアログが表示されることを確認
    // （確認ダイアログの表示は clickDeleteArticle 内で待機済み）
    // ここでは削除をキャンセル
    await adminDashboardPage.cancelDelete();
  });

  authenticatedTest('should cancel article deletion', async ({ adminDashboardPage }) => {
    // Arrange: 削除前の記事数を取得
    const originalCount = await adminDashboardPage.getArticleCount();

    // Act: 削除を試みるがキャンセル
    await adminDashboardPage.clickDeleteArticle(0);
    await adminDashboardPage.cancelDelete();

    // Assert: 記事数が変わっていないことを確認
    const currentCount = await adminDashboardPage.getArticleCount();
    expect(currentCount).toBe(originalCount);
  });
});

authenticatedTest.describe('Admin Dashboard - Article Status Management', () => {
  authenticatedTest.beforeEach(async ({ adminDashboardPage }) => {
    await adminDashboardPage.navigate();
  });

  authenticatedTest('should publish draft article', async ({ adminDashboardPage }) => {
    // Arrange: 下書きフィルターを選択
    await adminDashboardPage.selectFilter('下書き');
    const draftCount = await adminDashboardPage.getArticleCount();

    // 下書き記事がない場合はスキップ
    if (draftCount === 0) {
      test.skip();
    }

    // Act: 下書き記事を公開
    await adminDashboardPage.publishArticle(0);

    // Assert: ページがリロードされて公開済みになることを確認
    await adminDashboardPage.navigate();
    await adminDashboardPage.selectFilter('公開済み');
    const publishedCount = await adminDashboardPage.getArticleCount();
    expect(publishedCount).toBeGreaterThan(0);
  });

  authenticatedTest('should unpublish published article', async ({ adminDashboardPage }) => {
    // Arrange: 公開済みフィルターを選択
    await adminDashboardPage.selectFilter('公開済み');
    const publishedCount = await adminDashboardPage.getArticleCount();

    // 公開済み記事がない場合はスキップ
    if (publishedCount === 0) {
      test.skip();
    }

    // Act: 公開済み記事を下書きに変更
    await adminDashboardPage.draftArticle(0);

    // Assert: ページがリロードされて下書きになることを確認
    await adminDashboardPage.navigate();
    await adminDashboardPage.selectFilter('下書き');
    const draftCount = await adminDashboardPage.getArticleCount();
    expect(draftCount).toBeGreaterThan(0);
  });
});

authenticatedTest.describe('Admin Dashboard - Logout', () => {
  authenticatedTest('should logout successfully', async ({ adminDashboardPage, page }) => {
    // Arrange: ダッシュボードに移動
    await adminDashboardPage.navigate();

    // Act: ログアウトボタンをクリック
    await adminDashboardPage.logout();

    // Assert: ログインページにリダイレクトされることを確認
    await page.waitForURL('**/login', { timeout: 10000 });
    expect(page.url()).toContain('/login');
  });
});

authenticatedTest.describe('Admin Dashboard - Responsive Design', () => {
  authenticatedTest('should display correctly on mobile viewport', async ({
    page,
    adminDashboardPage,
  }) => {
    // Arrange: モバイルビューポートに変更
    await page.setViewportSize({ width: 375, height: 667 });
    await adminDashboardPage.navigate();

    // Act & Assert: 記事一覧が表示されていることを確認
    const isVisible = await adminDashboardPage.isArticleListVisible();
    expect(isVisible).toBeTruthy();
  });

  authenticatedTest('should display correctly on tablet viewport', async ({
    page,
    adminDashboardPage,
  }) => {
    // Arrange: タブレットビューポートに変更
    await page.setViewportSize({ width: 768, height: 1024 });
    await adminDashboardPage.navigate();

    // Act & Assert: 記事一覧が表示されていることを確認
    const isVisible = await adminDashboardPage.isArticleListVisible();
    expect(isVisible).toBeTruthy();
  });
});
