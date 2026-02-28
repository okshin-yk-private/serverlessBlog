import { test, expect } from '../fixtures';

/**
 * ホームページの最小限E2Eテスト
 *
 * このテストは重要なユーザーフローのみを検証します：
 * - ホームページの表示
 * - 記事詳細へのナビゲーション
 *
 * 詳細な表示テストは統合テスト・ユニットテストで実施済みです。
 *
 * Requirements:
 * - R43: UI E2Eテスト（最小限）（ホームページ）
 */

test.describe('Home Page - Minimal E2E', () => {
  test.beforeEach(async ({ homePage }) => {
    await homePage.navigate();
  });

  test('should display article list', async ({ homePage }) => {
    // Assert: 記事一覧が表示されていることを確認
    const isVisible = await homePage.isArticleListVisible();
    expect(isVisible).toBeTruthy();

    // 少なくとも1つの記事が表示されていることを確認
    const articleCount = await homePage.getArticleCount();
    expect(articleCount).toBeGreaterThan(0);
  });

  test('should navigate to article detail page', async ({ homePage, page }) => {
    // Act: 最初の記事をクリック
    await homePage.clickArticle(0);

    // Assert: 記事詳細ページに遷移することを確認
    await page.waitForURL('**/posts/**', { timeout: 10000 });
    expect(page.url()).toContain('/posts/');
  });
});
