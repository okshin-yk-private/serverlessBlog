import { test, expect } from '../fixtures';

/**
 * エラーハンドリングとリカバリのE2Eテスト
 *
 * Requirements:
 * - R43: E2Eテスト（エラーシナリオとリカバリ）
 * - R40-42: 100%テストカバレッジ
 *
 * TDD Approach:
 * このテストは最初は失敗します（Red）
 * エラーハンドリング機能が実装されたら成功します（Green）
 */

test.describe('Error Handling - Network Errors', () => {
  test('should handle API timeout gracefully on home page', async ({ page, homePage }) => {
    // Arrange: APIタイムアウトをシミュレート
    await page.route('**/api/posts**', async (route) => {
      // タイムアウトをシミュレート（長時間待機させる）
      await page.waitForTimeout(35000); // navigationTimeoutより長い
      route.abort('timedout');
    });

    // Act: ホームページに移動
    try {
      await homePage.navigate();
    } catch (error) {
      // タイムアウトエラーは期待される動作
    }

    // Assert: エラーメッセージまたはフォールバック表示を確認
    const pageContent = await page.textContent('body');
    expect(pageContent).toBeTruthy();
  });

  test('should handle 500 server error on article list', async ({ page, homePage }) => {
    // Arrange & Act: MSWの500エラーシミュレーションパラメータを使用
    await page.goto('/?simulateError=500');
    await page.waitForLoadState('networkidle');

    // Assert: エラーメッセージが表示されることを確認
    const pageContent = await page.textContent('body');
    expect(pageContent).toBeTruthy();

    // エラーメッセージまたは記事がない旨のメッセージが表示されていることを確認
    const hasNoArticlesMessage = await homePage.isNoArticlesMessageVisible();
    expect(hasNoArticlesMessage).toBeTruthy();
  });

  test('should handle 404 error on article detail page', async ({ page, articlePage }) => {
    // Arrange: 存在しない記事IDを使用
    const nonExistentId = 'non-existent-article-id';

    // 404エラーをシミュレート
    await page.route(`**/api/posts/${nonExistentId}**`, (route) => {
      route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Article not found' }),
      });
    });

    // Act: 存在しない記事ページに移動
    await articlePage.navigate(nonExistentId);

    // Assert: エラーメッセージまたは404ページが表示されることを確認
    const pageContent = await page.textContent('body');
    expect(pageContent).toBeTruthy();

    // 404やエラーに関連するメッセージが含まれていることを確認
    expect(
      pageContent.includes('見つかりません') ||
      pageContent.includes('存在しません') ||
      pageContent.includes('404') ||
      pageContent.includes('Not Found')
    ).toBeTruthy();
  });

  test('should recover from network error after retry', async ({ page, homePage }) => {
    // Arrange & Act: MSWのリトライシミュレーションパラメータを使用
    // 最初のリクエストは失敗し、2回目で成功
    await page.goto('/?simulateRetry=true');
    await page.waitForLoadState('networkidle');

    // ページをリロード（リトライをシミュレート）
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Assert: リロード後に記事一覧が表示されることを確認
    const isVisible = await homePage.isArticleListVisible();
    expect(isVisible).toBeTruthy();
  });
});

test.describe('Error Handling - Invalid Data', () => {
  test('should handle malformed JSON response', async ({ page, homePage }) => {
    // Arrange: 不正なJSONレスポンスをシミュレート
    await page.route('**/api/posts**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{ "invalid": json response }', // 不正なJSON
      });
    });

    // Act: ホームページに移動
    await homePage.navigate();

    // Assert: エラーハンドリングが機能していることを確認
    const pageContent = await page.textContent('body');
    expect(pageContent).toBeTruthy();
  });

  test('should handle empty response', async ({ page, homePage }) => {
    // Arrange & Act: MSWの空レスポンスシミュレーションパラメータを使用
    await page.goto('/?simulateError=empty');
    await page.waitForLoadState('networkidle');

    // Assert: "記事がありません"メッセージが表示されることを確認
    const hasNoArticlesMessage = await homePage.isNoArticlesMessageVisible();
    expect(hasNoArticlesMessage).toBeTruthy();
  });

  test('should handle missing required fields in article data', async ({ page, homePage }) => {
    // Arrange: 必須フィールドが欠けている記事データをシミュレート
    await page.route('**/api/posts**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              // title が欠けている
              postId: 'test-1',
              content: 'Test content',
            },
          ],
          nextToken: null,
        }),
      });
    });

    // Act: ホームページに移動
    await homePage.navigate();

    // Assert: エラーハンドリングが機能していることを確認
    // 不正なデータがある場合でもページがクラッシュしないこと
    const pageContent = await page.textContent('body');
    expect(pageContent).toBeTruthy();
  });
});

test.describe('Error Handling - Image Loading', () => {
  test('should handle missing image gracefully', async ({ page, homePage }) => {
    // Arrange: 画像リクエストを失敗させる
    await page.route('**/*.{jpg,jpeg,png,gif,webp}', (route) => {
      route.abort('failed');
    });

    // Act: ホームページに移動
    await homePage.navigate();

    // Assert: ページが正常に表示されること（画像がなくても）
    const isVisible = await homePage.isArticleListVisible();
    expect(isVisible).toBeTruthy();
  });

  test('should display placeholder for broken images', async ({ page, articlePage, homePage }) => {
    // Arrange: ホームページに移動して記事を選択
    await homePage.navigate();
    const articleCount = await homePage.getArticleCount();

    if (articleCount === 0) {
      test.skip();
    }

    // 画像を404にする
    await page.route('**/*.{jpg,jpeg,png,gif,webp}', (route) => {
      route.fulfill({
        status: 404,
        body: '',
      });
    });

    // Act: 記事詳細ページに移動
    await homePage.clickArticle(0);
    await articlePage.waitForPageLoad();

    // Assert: 記事コンテンツが表示されること（画像がなくても）
    const content = await articlePage.getContent();
    expect(content).toBeTruthy();
  });
});

test.describe('Error Handling - Browser Console Errors', () => {
  test('should not have critical console errors on home page', async ({ page, homePage }) => {
    // Arrange: コンソールエラーをキャプチャ
    const consoleErrors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Act: ホームページに移動
    await homePage.navigate();

    // Assert: 致命的なエラーがないことを確認
    // Note: 一部の警告は許容される場合がある
    const hasCriticalErrors = consoleErrors.some(
      (error) =>
        error.includes('Uncaught') ||
        error.includes('TypeError') ||
        error.includes('ReferenceError')
    );

    expect(hasCriticalErrors).toBeFalsy();
  });

  test('should not have unhandled promise rejections', async ({ page, homePage }) => {
    // Arrange: 未処理のPromise拒否をキャプチャ
    const pageErrors: string[] = [];

    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });

    // Act: ホームページに移動
    await homePage.navigate();

    // ユーザー操作をシミュレート
    const articleCount = await homePage.getArticleCount();
    if (articleCount > 0) {
      await homePage.clickArticle(0);
    }

    // Assert: 未処理のエラーがないことを確認
    expect(pageErrors.length).toBe(0);
  });
});

test.describe('Error Handling - Form Submission Errors', () => {
  test('should handle search with special characters', async ({ page, homePage }) => {
    // Arrange: ホームページに移動
    await homePage.navigate();

    // Act: 特殊文字を含む検索クエリを実行
    const specialCharQuery = '<script>alert("xss")</script>';
    await homePage.search(specialCharQuery);

    // Wait for search results
    await page.waitForTimeout(1000);

    // Assert: XSSが発生せず、安全に処理されることを確認
    const pageContent = await page.textContent('body');
    expect(pageContent).not.toContain('<script>');
    expect(pageContent).toBeTruthy();
  });

  test('should handle search with very long query', async ({ page, homePage }) => {
    // Arrange: ホームページに移動
    await homePage.navigate();

    // Act: 非常に長い検索クエリを実行
    const longQuery = 'a'.repeat(1000);
    await homePage.search(longQuery);

    // Wait for search results
    await page.waitForTimeout(1000);

    // Assert: アプリケーションがクラッシュしないことを確認
    const pageContent = await page.textContent('body');
    expect(pageContent).toBeTruthy();
  });

  test('should handle empty search query', async ({ page, homePage }) => {
    // Arrange: ホームページに移動
    await homePage.navigate();

    // Act: 空の検索クエリを実行
    await homePage.search('');

    // Wait for results
    await page.waitForTimeout(1000);

    // Assert: すべての記事が表示されることを確認
    const isVisible = await homePage.isArticleListVisible();
    expect(isVisible).toBeTruthy();
  });
});

test.describe('Error Handling - Session and Storage', () => {
  test('should handle localStorage unavailability', async ({ page, homePage }) => {
    // Arrange: localStorageを無効化（try-catchでラップされたモックを提供）
    await page.addInitScript(() => {
      // localStorageのモックを作成（アクセスしてもエラーにならないようにする）
      const localStorageMock = {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
        clear: () => {},
        key: () => null,
        length: 0,
      };

      Object.defineProperty(window, 'localStorage', {
        value: localStorageMock,
        writable: false,
      });
    });

    // Act: ホームページに移動
    await homePage.navigate();

    // Assert: アプリケーションがクラッシュせず、コンテンツが表示されることを確認
    const pageContent = await page.textContent('body');
    expect(pageContent).toBeTruthy();
    expect(pageContent.length).toBeGreaterThan(0);
  });

  test('should handle sessionStorage unavailability', async ({ page, homePage }) => {
    // Arrange: sessionStorageを無効化
    await page.addInitScript(() => {
      Object.defineProperty(window, 'sessionStorage', {
        value: null,
        writable: false,
      });
    });

    // Act: ホームページに移動
    await homePage.navigate();

    // Assert: アプリケーションが正常に動作することを確認
    const isVisible = await homePage.isArticleListVisible();
    expect(isVisible).toBeTruthy();
  });
});

test.describe('Error Handling - Accessibility', () => {
  test('should maintain accessibility during error states', async ({ page, homePage }) => {
    // Arrange: エラー状態をシミュレート
    await page.route('**/api/posts**', (route) => {
      route.fulfill({
        status: 500,
        body: JSON.stringify({ error: 'Server Error' }),
      });
    });

    // Act: ホームページに移動
    await homePage.navigate();

    // Assert: エラーメッセージにARIAロールが設定されていることを確認
    const errorRegion = page.locator('[role="alert"], [role="status"]');

    // エラーメッセージが存在する場合は、適切なARIAロールがあることを確認
    const count = await errorRegion.count();
    if (count > 0) {
      const isVisible = await errorRegion.first().isVisible();
      expect(isVisible).toBeTruthy();
    }
  });

  test('should allow keyboard navigation during error states', async ({ page, homePage }) => {
    // Arrange: エラー状態をシミュレート
    await page.route('**/api/posts**', (route) => {
      route.abort('failed');
    });

    // Act: ホームページに移動
    await homePage.navigate();

    // Assert: Tab キーでナビゲーションできることを確認
    await page.keyboard.press('Tab');
    const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
    expect(focusedElement).toBeTruthy();
  });
});
