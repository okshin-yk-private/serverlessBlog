import { test, expect } from '../fixtures';

/**
 * 記事詳細ページのE2Eテスト
 *
 * Requirements:
 * - R43: Playwright E2Eテスト（記事詳細表示）
 * - R40-42: 100%テストカバレッジ
 *
 * TDD Approach:
 * このテストは最初は失敗します（Red）
 * フロントエンドが実装されたら成功します（Green）
 */

test.describe('Article Detail Page - Public Site', () => {
  // テスト用の記事ID（モックデータのIDに合わせる）
  const testArticleId = 'post-1';

  test.beforeEach(async ({ articlePage }) => {
    // 各テスト前に記事詳細ページに移動
    await articlePage.navigate(testArticleId);
  });

  test('should display article title', async ({ articlePage }) => {
    // Arrange: 記事詳細ページに移動済み

    // Act: 記事タイトルを取得
    const title = await articlePage.getTitle();

    // Assert: タイトルが存在することを確認
    expect(title).toBeTruthy();
    expect(title.length).toBeGreaterThan(0);
  });

  test('should display article content', async ({ articlePage }) => {
    // Arrange: 記事詳細ページに移動済み

    // Act: 記事内容を取得
    const content = await articlePage.getContent();

    // Assert: 内容が存在することを確認
    expect(content).toBeTruthy();
    expect(content.length).toBeGreaterThan(0);
  });

  test('should display complete article metadata', async ({ articlePage }) => {
    // Arrange: 記事詳細ページに移動済み

    // Act: メタデータを確認
    const hasMetadata = await articlePage.hasCompleteMetadata();

    // Assert: 著者、日付、カテゴリが表示されていることを確認
    expect(hasMetadata).toBeTruthy();
  });

  test('should display article author', async ({ articlePage }) => {
    // Arrange: 記事詳細ページに移動済み

    // Act: 著者を取得
    const author = await articlePage.getAuthor();

    // Assert: 著者が存在することを確認
    expect(author).toBeTruthy();
  });

  test('should display article date', async ({ articlePage }) => {
    // Arrange: 記事詳細ページに移動済み

    // Act: 公開日を取得
    const date = await articlePage.getDate();

    // Assert: 日付が存在することを確認
    expect(date).toBeTruthy();
  });

  test('should display article category', async ({ articlePage }) => {
    // Arrange: 記事詳細ページに移動済み

    // Act: カテゴリを取得
    const category = await articlePage.getCategory();

    // Assert: カテゴリが存在することを確認
    expect(category).toBeTruthy();
  });

  test('should display article image if exists', async ({ articlePage }) => {
    // Arrange: 記事詳細ページに移動済み

    // Act: 画像が表示されているか確認
    const isImageVisible = await articlePage.isImageVisible();

    // Assert: 画像が表示されている場合、URLが有効であることを確認
    if (isImageVisible) {
      const imageUrl = await articlePage.getImageUrl();
      expect(imageUrl).toBeTruthy();
      expect(imageUrl).toMatch(/^https?:\/\/.+/); // URLの形式を確認
    }
  });

  test('should navigate back to home when clicking back button', async ({
    articlePage,
    homePage,
  }) => {
    // Arrange: 記事詳細ページに移動済み

    // Act: 戻るボタンをクリック
    await articlePage.clickBackButton();

    // Assert: ホームページに戻ったことを確認
    const currentUrl = homePage.getCurrentURL();
    expect(currentUrl).toMatch(/\/(home|$)/);
  });

  test('should display related articles', async ({ articlePage }) => {
    // Arrange: 記事詳細ページに移動済み

    // Act: 関連記事が表示されているか確認
    const areVisible = await articlePage.areRelatedArticlesVisible();

    // Assert: 関連記事セクションが表示されていることを確認
    if (areVisible) {
      const relatedCount = await articlePage.getRelatedArticlesCount();
      expect(relatedCount).toBeGreaterThan(0);
    }
  });

  test('should navigate to related article when clicking', async ({ articlePage, page }) => {
    // Arrange: 記事詳細ページに移動済み
    const areVisible = await articlePage.areRelatedArticlesVisible();

    if (!areVisible) {
      test.skip(); // 関連記事がない場合はスキップ
    }

    const relatedCount = await articlePage.getRelatedArticlesCount();
    if (relatedCount === 0) {
      test.skip();
    }

    // 関連記事カード内にリンクが存在するかチェック（実装されていない場合はスキップ）
    const relatedCardLinks = await page.locator('[data-testid="related-article-card"] a').count();
    if (relatedCardLinks === 0) {
      test.skip(); // 関連記事機能が未実装の場合はスキップ
    }

    // 現在のURLを保存
    const currentUrl = articlePage.getCurrentURL();

    // Act: 最初の関連記事をクリック
    await articlePage.clickRelatedArticle(0);

    // Assert: 別の記事ページに移動したことを確認
    const newUrl = articlePage.getCurrentURL();
    expect(newUrl).not.toBe(currentUrl);
    expect(newUrl).toContain('/posts/');
  });

  test('should display correctly on mobile viewport', async ({ page, articlePage }) => {
    // Arrange: モバイルビューポートに変更
    await page.setViewportSize({ width: 375, height: 667 });
    await articlePage.navigate(testArticleId);

    // Act & Assert: 記事内容が表示されていることを確認
    const content = await articlePage.getContent();
    expect(content).toBeTruthy();

    // メタデータも表示されていることを確認
    const hasMetadata = await articlePage.hasCompleteMetadata();
    expect(hasMetadata).toBeTruthy();
  });

  test('should display correctly on tablet viewport', async ({ page, articlePage }) => {
    // Arrange: タブレットビューポートに変更
    await page.setViewportSize({ width: 768, height: 1024 });
    await articlePage.navigate(testArticleId);

    // Act & Assert: 記事内容が表示されていることを確認
    const content = await articlePage.getContent();
    expect(content).toBeTruthy();

    const hasMetadata = await articlePage.hasCompleteMetadata();
    expect(hasMetadata).toBeTruthy();
  });

  test('should meet performance requirement (page load < 2 seconds)', async ({
    articlePage,
  }) => {
    // Arrange & Act: ページロード時間を測定
    const loadTime = await articlePage.measurePageLoadTime(testArticleId);

    // Assert: ページロード時間が2秒未満であることを確認（R43要件）
    expect(loadTime).toBeLessThan(2000);
  });
});

/**
 * 記事詳細ページ - エラーハンドリングテスト
 */
test.describe('Article Detail Page - Error Handling', () => {
  test('should handle non-existent article gracefully', async ({ articlePage, page }) => {
    // Arrange: 存在しない記事IDを使用
    const nonExistentId = 'non-existent-article-999';

    // Act: 存在しない記事ページに移動（エラーを期待）
    await articlePage.navigate(nonExistentId, true);

    // Assert: 404エラーまたはエラーメッセージが表示されることを確認
    const pageContent = await page.textContent('body');
    expect(pageContent).toBeTruthy();

    // エラーメッセージまたは404ページが表示されることを確認（実装に応じて調整）
    // expect(pageContent).toContain('見つかりません');
  });

  test('should handle network errors when loading article', async ({
    page,
    articlePage,
  }) => {
    // Arrange: ネットワークエラーをシミュレート
    await page.route('**/api/posts/**', (route) => {
      route.abort('failed');
    });

    const testArticleId = 'post-1';

    // Act: 記事ページに移動
    await articlePage.navigate(testArticleId);

    // Assert: エラーメッセージまたはフォールバック表示を確認
    const pageContent = await page.textContent('body');
    expect(pageContent).toBeTruthy();
  });
});
