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
  // テスト用の記事ID（モックデータのID）
  const testArticleId = 'post-1';

  test('should display article detail with title and content', async ({ articlePage }) => {
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
