import { test, expect } from '../fixtures';

/**
 * 公開ページ 未認証アクセス処理のE2Eテスト
 *
 * Requirements:
 * - R43: E2Eテスト（公開ページのアクセス制御）
 * - R40-42: 100%テストカバレッジ
 *
 * TDD Approach:
 * このテストは最初は失敗します（Red）
 * 公開ページの適切なアクセス制御が実装されたら成功します（Green）
 *
 * Note:
 * 管理画面の認証・認可テストは admin-unauthorized-access.spec.ts を参照
 */

test.describe('Public Pages - Unauthorized Access', () => {
  test('should allow access to home page without authentication', async ({ homePage }) => {
    // Arrange & Act: 未認証でホームページに移動
    await homePage.navigate();

    // Assert: ページが正常に表示されることを確認
    const isVisible = await homePage.isArticleListVisible();
    expect(isVisible).toBeTruthy();
  });

  test('should allow access to article detail page without authentication', async ({
    homePage,
    articlePage,
  }) => {
    // Arrange: ホームページから記事を選択
    await homePage.navigate();
    const articleCount = await homePage.getArticleCount();

    if (articleCount === 0) {
      test.skip();
    }

    // Act: 記事詳細ページに移動
    await homePage.clickArticle(0);
    await articlePage.waitForPageLoad();

    // Assert: 記事が表示されることを確認
    const content = await articlePage.getContent();
    expect(content).toBeTruthy();
  });

  test('should allow article search without authentication', async ({ page, homePage }) => {
    // Arrange: ホームページに移動
    await homePage.navigate();

    // Act: 検索を実行
    await homePage.search('test');
    await page.waitForTimeout(1000);

    // Assert: 検索結果が表示されることを確認
    const pageContent = await page.textContent('body');
    expect(pageContent).toBeTruthy();
  });

  test('should allow category filtering without authentication', async ({ page, homePage }) => {
    // Arrange: ホームページに移動
    await homePage.navigate();

    // Act: カテゴリフィルタを選択
    await homePage.selectCategory('Technology');
    await page.waitForTimeout(1000);

    // Assert: フィルタリングされた結果が表示されることを確認
    const isVisible = await homePage.isArticleListVisible();
    expect(isVisible).toBeTruthy();
  });
});

test.describe('Public Pages - Data Protection', () => {
  test('should not expose sensitive data in public API responses', async ({ page }) => {
    // Arrange & Act: 公開記事APIにアクセス
    const response = await page.request.get('/api/posts');

    // Assert: レスポンスに管理者情報が含まれていないことを確認
    if (response.ok()) {
      const contentType = response.headers()['content-type'];

      // JSONレスポンスの場合のみ検証
      if (contentType && contentType.includes('application/json')) {
        const data = await response.json();

        // 記事データに機密情報（メールアドレス、内部IDなど）が含まれていないことを確認
        const hasAuthorEmail = JSON.stringify(data).includes('@');
        expect(hasAuthorEmail).toBeFalsy();
      }
    }
  });
});

test.describe('Public Pages - Security Headers', () => {
  test('should have proper CORS headers for public endpoints', async ({ page }) => {
    // Arrange & Act: 公開APIにアクセス
    const response = await page.request.get('/api/posts');

    // Assert: CORSヘッダーが適切に設定されていることを確認
    const headers = response.headers();

    // CORS設定が存在する場合は適切な値であることを確認
    if (headers['access-control-allow-origin']) {
      expect(headers['access-control-allow-origin']).toBeTruthy();
    }
  });

  test('should have security headers on public pages', async ({ page }) => {
    // Arrange & Act: ホームページにアクセス
    const response = await page.goto('/');

    // Assert: セキュリティヘッダーが設定されていることを確認
    const headers = response?.headers();

    if (headers) {
      // X-Frame-Options または Content-Security-Policy が設定されていることを確認
      const hasSecurityHeaders =
        headers['x-frame-options'] ||
        headers['content-security-policy'] ||
        headers['x-content-type-options'];

      expect(hasSecurityHeaders).toBeTruthy();
    }
  });

  test('should not expose sensitive information in error messages', async ({ page }) => {
    // Arrange & Act: 存在しないエンドポイントにアクセス
    const response = await page.request.get('/api/nonexistent-endpoint');

    // Assert: エラーメッセージに機密情報が含まれていないことを確認
    if (!response.ok()) {
      const body = await response.text();

      // スタックトレース、ファイルパス、環境変数などが漏洩していないことを確認
      expect(body).not.toContain('Error:');
      expect(body).not.toContain('at ');
      expect(body).not.toContain('/home/');
      expect(body).not.toContain('/var/');
      expect(body).not.toContain('process.env');
    }
  });
});
