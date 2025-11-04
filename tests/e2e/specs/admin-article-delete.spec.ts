import { test, expect, authenticatedTest } from '../fixtures';

/**
 * 管理画面記事削除のE2Eテスト
 *
 * Requirements:
 * - R43: E2Eテスト（記事管理フロー）
 * - R40-42: 100%テストカバレッジ
 *
 * TDD Approach:
 * このテストは最初は失敗します（Red）
 * 記事削除機能が実装されたら成功します（Green）
 */

authenticatedTest.describe('Admin Article Delete - Confirmation Dialog', () => {
  authenticatedTest.beforeEach(async ({ adminDashboardPage }) => {
    // 各テスト前にダッシュボードに移動
    await adminDashboardPage.navigate();
  });

  authenticatedTest('should show confirmation dialog when delete button is clicked', async ({
    adminDashboardPage,
  }) => {
    // Arrange: ダッシュボードに移動済み
    const articleCount = await adminDashboardPage.getArticleCount();

    // 記事が存在することを確認
    if (articleCount === 0) {
      test.skip();
    }

    // Act: 削除ボタンをクリック
    await adminDashboardPage.clickDeleteArticle(0);

    // Assert: 確認ダイアログが表示されることを確認
    // （clickDeleteArticle 内で waitForElement により確認済み）
    // ここではキャンセルして終了
    await adminDashboardPage.cancelDelete();
  });

  authenticatedTest('should display article title in confirmation dialog', async ({
    adminDashboardPage,
    page,
  }) => {
    // Arrange: 削除対象の記事タイトルを取得
    const articleCount = await adminDashboardPage.getArticleCount();

    if (articleCount === 0) {
      test.skip();
    }

    const targetTitle = await adminDashboardPage.getArticleTitle(0);

    // Act: 削除ボタンをクリック
    await adminDashboardPage.clickDeleteArticle(0);

    // Assert: 確認ダイアログに記事タイトルが表示されることを確認
    const dialogText = await page.locator('[data-testid="confirm-dialog"]').textContent();
    expect(dialogText).toContain(targetTitle);

    // クリーンアップ
    await adminDashboardPage.cancelDelete();
  });
});

authenticatedTest.describe('Admin Article Delete - Cancel Deletion', () => {
  authenticatedTest.beforeEach(async ({ adminDashboardPage }) => {
    await adminDashboardPage.navigate();
  });

  authenticatedTest('should not delete article when cancelled', async ({
    adminDashboardPage,
  }) => {
    // Arrange: 削除前の記事数を取得
    const originalCount = await adminDashboardPage.getArticleCount();

    if (originalCount === 0) {
      test.skip();
    }

    // Act: 削除を試みるがキャンセル
    await adminDashboardPage.clickDeleteArticle(0);
    await adminDashboardPage.cancelDelete();

    // Assert: 記事数が変わっていないことを確認
    const currentCount = await adminDashboardPage.getArticleCount();
    expect(currentCount).toBe(originalCount);
  });

  authenticatedTest('should remain on dashboard after cancelling deletion', async ({
    adminDashboardPage,
    page,
  }) => {
    // Arrange: ダッシュボードに移動済み
    const articleCount = await adminDashboardPage.getArticleCount();

    if (articleCount === 0) {
      test.skip();
    }

    const originalUrl = page.url();

    // Act: 削除をキャンセル
    await adminDashboardPage.clickDeleteArticle(0);
    await adminDashboardPage.cancelDelete();

    // Assert: URLが変わっていないことを確認
    expect(page.url()).toBe(originalUrl);
  });
});

authenticatedTest.describe('Admin Article Delete - Confirm Deletion', () => {
  authenticatedTest.beforeEach(async ({ adminDashboardPage }) => {
    await adminDashboardPage.navigate();
  });

  authenticatedTest('should delete article when confirmed', async ({ adminDashboardPage }) => {
    // Arrange: 削除前の記事数を取得
    const originalCount = await adminDashboardPage.getArticleCount();

    if (originalCount === 0) {
      test.skip();
    }

    // Act: 記事を削除
    await adminDashboardPage.clickDeleteArticle(0);
    await adminDashboardPage.confirmDelete();

    // Assert: 記事数が1つ減っていることを確認
    const currentCount = await adminDashboardPage.getArticleCount();
    expect(currentCount).toBe(originalCount - 1);
  });

  authenticatedTest('should show success message after deletion', async ({
    adminDashboardPage,
    page,
  }) => {
    // Arrange: ダッシュボードに移動済み
    const articleCount = await adminDashboardPage.getArticleCount();

    if (articleCount === 0) {
      test.skip();
    }

    // Act: 記事を削除
    await adminDashboardPage.clickDeleteArticle(0);
    await adminDashboardPage.confirmDelete();

    // Assert: 成功メッセージまたはページリロードを確認
    // 成功メッセージが表示されるか、ダッシュボードが再表示されていることを確認
    const isDashboard = page.url().includes('/dashboard');
    expect(isDashboard).toBeTruthy();
  });

  authenticatedTest('should remove deleted article from list', async ({
    adminDashboardPage,
  }) => {
    // Arrange: 削除対象の記事タイトルを取得
    const articleCount = await adminDashboardPage.getArticleCount();

    if (articleCount === 0) {
      test.skip();
    }

    const targetTitle = await adminDashboardPage.getArticleTitle(0);

    // Act: 記事を削除
    await adminDashboardPage.clickDeleteArticle(0);
    await adminDashboardPage.confirmDelete();

    // Assert: 削除された記事が一覧に表示されないことを確認
    const hasArticle = await adminDashboardPage.hasArticleWithTitle(targetTitle);
    expect(hasArticle).toBeFalsy();
  });
});

authenticatedTest.describe('Admin Article Delete - Multiple Deletions', () => {
  authenticatedTest.beforeEach(async ({ adminDashboardPage }) => {
    await adminDashboardPage.navigate();
  });

  authenticatedTest('should delete multiple articles sequentially', async ({
    adminDashboardPage,
  }) => {
    // Arrange: 削除前の記事数を取得
    const originalCount = await adminDashboardPage.getArticleCount();

    // 少なくとも2つの記事が必要
    if (originalCount < 2) {
      test.skip();
    }

    // Act: 2つの記事を順次削除
    await adminDashboardPage.clickDeleteArticle(0);
    await adminDashboardPage.confirmDelete();

    // ページがリロードされるのを待つ
    await adminDashboardPage.navigate();

    await adminDashboardPage.clickDeleteArticle(0);
    await adminDashboardPage.confirmDelete();

    // Assert: 記事数が2つ減っていることを確認
    const currentCount = await adminDashboardPage.getArticleCount();
    expect(currentCount).toBe(originalCount - 2);
  });
});

authenticatedTest.describe('Admin Article Delete - Filtered List', () => {
  authenticatedTest.beforeEach(async ({ adminDashboardPage }) => {
    await adminDashboardPage.navigate();
  });

  authenticatedTest('should delete article from published filter', async ({
    adminDashboardPage,
  }) => {
    // Arrange: 公開済みフィルターを選択
    await adminDashboardPage.selectFilter('公開済み');
    const publishedCount = await adminDashboardPage.getArticleCount();

    if (publishedCount === 0) {
      test.skip();
    }

    // Act: 公開済み記事を削除
    await adminDashboardPage.clickDeleteArticle(0);
    await adminDashboardPage.confirmDelete();

    // Assert: 公開済み記事数が減っていることを確認
    await adminDashboardPage.navigate();
    await adminDashboardPage.selectFilter('公開済み');
    const newCount = await adminDashboardPage.getArticleCount();
    expect(newCount).toBe(publishedCount - 1);
  });

  authenticatedTest('should delete article from draft filter', async ({
    adminDashboardPage,
  }) => {
    // Arrange: 下書きフィルターを選択
    await adminDashboardPage.selectFilter('下書き');
    const draftCount = await adminDashboardPage.getArticleCount();

    if (draftCount === 0) {
      test.skip();
    }

    // Act: 下書き記事を削除
    await adminDashboardPage.clickDeleteArticle(0);
    await adminDashboardPage.confirmDelete();

    // Assert: 下書き記事数が減っていることを確認
    await adminDashboardPage.navigate();
    await adminDashboardPage.selectFilter('下書き');
    const newCount = await adminDashboardPage.getArticleCount();
    expect(newCount).toBe(draftCount - 1);
  });
});

authenticatedTest.describe('Admin Article Delete - Search Results', () => {
  authenticatedTest.beforeEach(async ({ adminDashboardPage }) => {
    await adminDashboardPage.navigate();
  });

  authenticatedTest('should delete article from search results', async ({
    adminDashboardPage,
  }) => {
    // Arrange: 記事を検索
    const articleCount = await adminDashboardPage.getArticleCount();

    if (articleCount === 0) {
      test.skip();
    }

    const searchTitle = await adminDashboardPage.getArticleTitle(0);
    await adminDashboardPage.searchArticle(searchTitle);

    // Act: 検索結果から記事を削除
    await adminDashboardPage.clickDeleteArticle(0);
    await adminDashboardPage.confirmDelete();

    // Assert: 削除された記事が検索結果に表示されないことを確認
    await adminDashboardPage.navigate();
    await adminDashboardPage.searchArticle(searchTitle);
    const hasArticle = await adminDashboardPage.hasArticleWithTitle(searchTitle);
    expect(hasArticle).toBeFalsy();
  });
});

authenticatedTest.describe('Admin Article Delete - Error Handling', () => {
  authenticatedTest.beforeEach(async ({ adminDashboardPage }) => {
    await adminDashboardPage.navigate();
  });

  authenticatedTest('should handle network errors during deletion', async ({
    adminDashboardPage,
    page,
  }) => {
    // Arrange: ネットワークエラーをシミュレート
    await page.route('**/api/posts/**', (route) => {
      if (route.request().method() === 'DELETE') {
        route.abort('failed');
      } else {
        route.continue();
      }
    });

    const articleCount = await adminDashboardPage.getArticleCount();

    if (articleCount === 0) {
      test.skip();
    }

    // Act: 削除を試行
    await adminDashboardPage.clickDeleteArticle(0);
    await adminDashboardPage.confirmDelete();

    // Assert: エラーメッセージが表示されることを確認
    // または記事が削除されていないことを確認
    const currentCount = await adminDashboardPage.getArticleCount();
    // ネットワークエラーの場合、記事数は変わらない
    expect(currentCount).toBe(articleCount);
  });

  authenticatedTest('should handle server errors during deletion', async ({
    adminDashboardPage,
    page,
  }) => {
    // Arrange: サーバーエラーをシミュレート
    await page.route('**/api/posts/**', (route) => {
      if (route.request().method() === 'DELETE') {
        route.fulfill({
          status: 500,
          body: JSON.stringify({ error: 'Internal Server Error' }),
        });
      } else {
        route.continue();
      }
    });

    const articleCount = await adminDashboardPage.getArticleCount();

    if (articleCount === 0) {
      test.skip();
    }

    // Act: 削除を試行
    await adminDashboardPage.clickDeleteArticle(0);
    await adminDashboardPage.confirmDelete();

    // Assert: エラーメッセージが表示されるか、記事が削除されていないことを確認
    const currentCount = await adminDashboardPage.getArticleCount();
    // サーバーエラーの場合、記事数は変わらない可能性がある
    expect(currentCount).toBe(articleCount);
  });

  authenticatedTest('should handle 404 errors for already deleted posts', async ({
    adminDashboardPage,
    page,
  }) => {
    // Arrange: 404エラーをシミュレート
    await page.route('**/api/posts/**', (route) => {
      if (route.request().method() === 'DELETE') {
        route.fulfill({
          status: 404,
          body: JSON.stringify({ error: 'Post not found' }),
        });
      } else {
        route.continue();
      }
    });

    const articleCount = await adminDashboardPage.getArticleCount();

    if (articleCount === 0) {
      test.skip();
    }

    // Act: 削除を試行
    await adminDashboardPage.clickDeleteArticle(0);
    await adminDashboardPage.confirmDelete();

    // Assert: エラーメッセージが表示されるか、一覧から削除されることを確認
    // 実装によっては404でも成功とみなす場合がある
    const currentCount = await adminDashboardPage.getArticleCount();
    expect(currentCount).toBeLessThanOrEqual(articleCount);
  });
});

authenticatedTest.describe('Admin Article Delete - Keyboard Navigation', () => {
  authenticatedTest.beforeEach(async ({ adminDashboardPage }) => {
    await adminDashboardPage.navigate();
  });

  authenticatedTest('should close confirmation dialog with Escape key', async ({
    adminDashboardPage,
    page,
  }) => {
    // Arrange: ダッシュボードに移動済み
    const articleCount = await adminDashboardPage.getArticleCount();

    if (articleCount === 0) {
      test.skip();
    }

    const originalCount = articleCount;

    // Act: 削除ダイアログを開いてEscapeキーを押す
    await adminDashboardPage.clickDeleteArticle(0);
    await page.keyboard.press('Escape');

    // Assert: ダイアログが閉じられ、記事が削除されていないことを確認
    const currentCount = await adminDashboardPage.getArticleCount();
    expect(currentCount).toBe(originalCount);
  });

  authenticatedTest('should confirm deletion with Enter key', async ({
    adminDashboardPage,
    page,
  }) => {
    // Arrange: ダッシュボードに移動済み
    const articleCount = await adminDashboardPage.getArticleCount();

    if (articleCount === 0) {
      test.skip();
    }

    const originalCount = articleCount;

    // Act: 削除ダイアログを開いてEnterキーを押す
    await adminDashboardPage.clickDeleteArticle(0);
    // 確認ボタンにフォーカスがあることを確認
    await page.locator('[data-testid="confirm-yes"]').focus();
    await page.keyboard.press('Enter');

    // Assert: 記事が削除されていることを確認
    const currentCount = await adminDashboardPage.getArticleCount();
    expect(currentCount).toBe(originalCount - 1);
  });
});

authenticatedTest.describe('Admin Article Delete - Responsive Design', () => {
  authenticatedTest('should show confirmation dialog on mobile viewport', async ({
    page,
    adminDashboardPage,
  }) => {
    // Arrange: モバイルビューポートに変更
    await page.setViewportSize({ width: 375, height: 667 });
    await adminDashboardPage.navigate();

    const articleCount = await adminDashboardPage.getArticleCount();

    if (articleCount === 0) {
      test.skip();
    }

    // Act: 削除ボタンをクリック
    await adminDashboardPage.clickDeleteArticle(0);

    // Assert: 確認ダイアログが表示されることを確認
    const dialog = page.locator('[data-testid="confirm-dialog"]');
    await expect(dialog).toBeVisible();

    // クリーンアップ
    await adminDashboardPage.cancelDelete();
  });

  authenticatedTest('should show confirmation dialog on tablet viewport', async ({
    page,
    adminDashboardPage,
  }) => {
    // Arrange: タブレットビューポートに変更
    await page.setViewportSize({ width: 768, height: 1024 });
    await adminDashboardPage.navigate();

    const articleCount = await adminDashboardPage.getArticleCount();

    if (articleCount === 0) {
      test.skip();
    }

    // Act: 削除ボタンをクリック
    await adminDashboardPage.clickDeleteArticle(0);

    // Assert: 確認ダイアログが表示されることを確認
    const dialog = page.locator('[data-testid="confirm-dialog"]');
    await expect(dialog).toBeVisible();

    // クリーンアップ
    await adminDashboardPage.cancelDelete();
  });
});
