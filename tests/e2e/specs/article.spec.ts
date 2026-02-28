import { test, expect } from '../fixtures';

/**
 * 記事詳細ページの最小限E2Eテスト
 *
 * このテストは重要なユーザーフローのみを検証します：
 * - 記事詳細の表示
 *
 * 詳細な表示テストは統合テスト・ユニットテストで実施済みです。
 *
 * Requirements:
 * - R43: UI E2Eテスト（最小限）（記事詳細）
 */

test.describe('Article Detail Page - Minimal E2E', () => {
  test('should display article detail with title and content', async ({
    homePage,
    articlePage,
  }) => {
    // ホームページに移動し、最初の記事リンクのhrefから実際の記事IDを取得する
    // これにより、MSW環境（モックID）でもAWS実環境（実際のID）でも動作する
    await homePage.navigate();

    const firstArticleLink = homePage
      .getArticleCards()
      .nth(0)
      .locator('a')
      .first();
    const href = await firstArticleLink.getAttribute('href');
    const testArticleId = href ? href.split('/posts/')[1] : '';
    expect(testArticleId).toBeTruthy();

    // Act: 記事詳細ページに移動
    await articlePage.navigate(testArticleId);

    // Assert: タイトルと内容が表示されることを確認
    const title = await articlePage.getTitle();
    expect(title).toBeTruthy();
    expect(title.length).toBeGreaterThan(0);

    const content = await articlePage.getContent();
    expect(content).toBeTruthy();
    expect(content.length).toBeGreaterThan(0);
  });
});
