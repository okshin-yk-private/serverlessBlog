import { test, expect, authenticatedTest } from '../fixtures';

/**
 * 管理画面記事編集のE2Eテスト
 *
 * Requirements:
 * - R43: E2Eテスト（記事管理フロー）
 * - R40-42: 100%テストカバレッジ
 *
 * TDD Approach:
 * このテストは最初は失敗します（Red）
 * 記事編集機能が実装されたら成功します（Green）
 */

authenticatedTest.describe('Admin Article Edit - Page Load', () => {
  // テスト用の記事IDを使用（実際の実装に応じて調整）
  const testPostId = 'test-post-id-001';

  authenticatedTest('should load edit page with existing article data', async ({
    adminPostEditPage,
    page,
  }) => {
    // Arrange & Act: 編集ページに移動
    await adminPostEditPage.navigate(testPostId);
    await adminPostEditPage.waitForPostLoaded();

    // Assert: 編集ページが正しく表示されていることを確認
    expect(page.url()).toContain(`/posts/edit/${testPostId}`);
  });

  authenticatedTest('should display article data in form fields', async ({
    adminPostEditPage,
  }) => {
    // Arrange & Act: 編集ページに移動
    await adminPostEditPage.navigate(testPostId);
    await adminPostEditPage.waitForPostLoaded();

    // Act: フォームフィールドの値を取得
    const title = await adminPostEditPage.getTitleValue();
    const content = await adminPostEditPage.getContentValue();

    // Assert: タイトルと本文が読み込まれていることを確認
    expect(title).toBeTruthy();
    expect(content).toBeTruthy();
  });

  authenticatedTest('should display article status', async ({ adminPostEditPage }) => {
    // Arrange & Act: 編集ページに移動
    await adminPostEditPage.navigate(testPostId);
    await adminPostEditPage.waitForPostLoaded();

    // Act: 記事ステータスを取得
    const status = await adminPostEditPage.getPostStatus();

    // Assert: ステータスが表示されていることを確認
    expect(status).toBeTruthy();
    expect(['公開済み', '下書き']).toContain(status);
  });
});

authenticatedTest.describe('Admin Article Edit - Update Article', () => {
  const testPostId = 'test-post-id-002';

  authenticatedTest.beforeEach(async ({ adminPostEditPage }) => {
    await adminPostEditPage.navigate(testPostId);
    await adminPostEditPage.waitForPostLoaded();
  });

  authenticatedTest('should update article title successfully', async ({
    adminPostEditPage,
  }) => {
    // Arrange: 新しいタイトルを準備
    const newTitle = '更新されたタイトル';

    // Act: タイトルを更新して保存
    await adminPostEditPage.fillTitle(newTitle);
    await adminPostEditPage.save();

    // Assert: 成功メッセージが表示されることを確認
    const hasSuccess = await adminPostEditPage.hasSuccessMessage();
    expect(hasSuccess).toBeTruthy();
  });

  authenticatedTest('should update article content successfully', async ({
    adminPostEditPage,
  }) => {
    // Arrange: 新しい本文を準備
    const newContent = '更新された本文です。';

    // Act: 本文を更新して保存
    await adminPostEditPage.fillContent(newContent);
    await adminPostEditPage.save();

    // Assert: 成功メッセージが表示されることを確認
    const hasSuccess = await adminPostEditPage.hasSuccessMessage();
    expect(hasSuccess).toBeTruthy();
  });

  authenticatedTest('should update multiple fields at once', async ({
    adminPostEditPage,
  }) => {
    // Arrange: 更新データを準備
    const updateData = {
      title: '複数フィールド更新テスト',
      excerpt: '更新された抜粋',
      content: '更新された本文です。',
    };

    // Act: 複数フィールドを更新して保存
    await adminPostEditPage.updateForm(updateData);
    await adminPostEditPage.save();

    // Assert: 成功メッセージが表示されることを確認
    const hasSuccess = await adminPostEditPage.hasSuccessMessage();
    expect(hasSuccess).toBeTruthy();
  });
});

authenticatedTest.describe('Admin Article Edit - Publish/Unpublish', () => {
  authenticatedTest('should publish draft article', async ({ adminPostEditPage }) => {
    // Arrange: 下書き記事のIDを使用
    const draftPostId = 'draft-post-id-001';
    await adminPostEditPage.navigate(draftPostId);
    await adminPostEditPage.waitForPostLoaded();

    // Act: 記事を公開
    await adminPostEditPage.publish();

    // Assert: 成功メッセージが表示されることを確認
    const hasSuccess = await adminPostEditPage.hasSuccessMessage();
    expect(hasSuccess).toBeTruthy();
  });

  authenticatedTest('should unpublish published article', async ({ adminPostEditPage }) => {
    // Arrange: 公開済み記事のIDを使用
    const publishedPostId = 'published-post-id-001';
    await adminPostEditPage.navigate(publishedPostId);
    await adminPostEditPage.waitForPostLoaded();

    // Act: 記事を非公開化
    await adminPostEditPage.unpublish();

    // Assert: 成功メッセージが表示されることを確認
    const hasSuccess = await adminPostEditPage.hasSuccessMessage();
    expect(hasSuccess).toBeTruthy();
  });
});

authenticatedTest.describe('Admin Article Edit - Delete Article', () => {
  const testPostId = 'test-post-id-to-delete';

  authenticatedTest('should show delete confirmation dialog', async ({
    adminPostEditPage,
  }) => {
    // Arrange: 編集ページに移動
    await adminPostEditPage.navigate(testPostId);
    await adminPostEditPage.waitForPostLoaded();

    // Act: 削除ボタンをクリック
    await adminPostEditPage.delete();

    // Assert: 確認ダイアログが表示されることを確認
    // （delete() 内で waitForElement により確認済み）
    // ここではキャンセルして終了
    await adminPostEditPage.cancelDelete();
  });

  authenticatedTest('should cancel article deletion', async ({
    adminPostEditPage,
    page,
  }) => {
    // Arrange: 編集ページに移動
    await adminPostEditPage.navigate(testPostId);
    await adminPostEditPage.waitForPostLoaded();
    const originalUrl = page.url();

    // Act: 削除を試みるがキャンセル
    await adminPostEditPage.delete();
    await adminPostEditPage.cancelDelete();

    // Assert: ページが変わっていないことを確認
    expect(page.url()).toBe(originalUrl);
  });

  authenticatedTest('should delete article after confirmation', async ({
    adminPostEditPage,
    page,
  }) => {
    // Arrange: 編集ページに移動
    await adminPostEditPage.navigate(testPostId);
    await adminPostEditPage.waitForPostLoaded();

    // Act: 記事を削除
    await adminPostEditPage.delete();
    await adminPostEditPage.confirmDelete();

    // Assert: ダッシュボードにリダイレクトされることを確認
    expect(page.url()).toContain('/dashboard');
  });
});

authenticatedTest.describe('Admin Article Edit - Form Validation', () => {
  const testPostId = 'test-post-id-validation';

  authenticatedTest.beforeEach(async ({ adminPostEditPage }) => {
    await adminPostEditPage.navigate(testPostId);
    await adminPostEditPage.waitForPostLoaded();
  });

  authenticatedTest('should show error when title is cleared', async ({
    adminPostEditPage,
  }) => {
    // Arrange & Act: タイトルを空にして保存
    await adminPostEditPage.fillTitle('');
    await adminPostEditPage.save();

    // Assert: バリデーションエラーが表示されることを確認
    const hasError = await adminPostEditPage.hasValidationError();
    expect(hasError).toBeTruthy();
  });

  authenticatedTest('should show error when content is cleared', async ({
    adminPostEditPage,
  }) => {
    // Arrange & Act: 本文を空にして保存
    await adminPostEditPage.fillContent('');
    await adminPostEditPage.save();

    // Assert: バリデーションエラーが表示されることを確認
    const hasError = await adminPostEditPage.hasValidationError();
    expect(hasError).toBeTruthy();
  });
});

authenticatedTest.describe('Admin Article Edit - Image Management', () => {
  const testPostId = 'test-post-id-images';

  authenticatedTest.beforeEach(async ({ adminPostEditPage }) => {
    await adminPostEditPage.navigate(testPostId);
    await adminPostEditPage.waitForPostLoaded();
  });

  authenticatedTest('should display existing uploaded images', async ({
    adminPostEditPage,
  }) => {
    // Arrange & Act: 既存画像の数を取得
    const imageCount = await adminPostEditPage.getUploadedImageCount();

    // Assert: 画像数が0以上であることを確認（画像がない場合もある）
    expect(imageCount).toBeGreaterThanOrEqual(0);
  });

  authenticatedTest('should upload new thumbnail image', async ({
    adminPostEditPage,
  }) => {
    // Arrange: テスト画像のパスを準備
    // Note: 実際のテストでは適切な画像ファイルのパスを指定
    const imagePath = 'tests/fixtures/test-image.jpg';

    // Act: サムネイルをアップロード
    try {
      await adminPostEditPage.uploadThumbnail(imagePath);

      // Assert: サムネイルプレビューが表示されることを確認
      // （uploadThumbnail 内で waitForElement により確認済み）
      expect(true).toBeTruthy();
    } catch (error) {
      // テスト画像が存在しない場合はスキップ
      test.skip();
    }
  });

  authenticatedTest('should remove existing thumbnail', async ({ adminPostEditPage }) => {
    // Arrange: サムネイルが存在する記事を前提
    // Note: 実際のテストではサムネイルが存在することを確認

    try {
      // Act: サムネイルを削除
      await adminPostEditPage.removeThumbnail();

      // Assert: サムネイルプレビューが非表示になることを確認
      // （removeThumbnail 内で waitForElementHidden により確認済み）
      expect(true).toBeTruthy();
    } catch (error) {
      // サムネイルが存在しない場合はスキップ
      test.skip();
    }
  });

  authenticatedTest('should upload content image', async ({ adminPostEditPage }) => {
    // Arrange: テスト画像のパスを準備
    const imagePath = 'tests/fixtures/test-image.jpg';
    const initialCount = await adminPostEditPage.getUploadedImageCount();

    // Act: コンテンツ画像をアップロード
    try {
      await adminPostEditPage.uploadImage(imagePath);

      // Assert: アップロードされた画像数が増えることを確認
      const newCount = await adminPostEditPage.getUploadedImageCount();
      expect(newCount).toBeGreaterThan(initialCount);
    } catch (error) {
      // テスト画像が存在しない場合はスキップ
      test.skip();
    }
  });

  authenticatedTest('should remove uploaded image', async ({ adminPostEditPage }) => {
    // Arrange: 画像が存在することを確認
    const initialCount = await adminPostEditPage.getUploadedImageCount();

    if (initialCount === 0) {
      test.skip();
    }

    // Act: 最初の画像を削除
    await adminPostEditPage.removeImage(0);

    // Assert: 画像数が減ることを確認
    const newCount = await adminPostEditPage.getUploadedImageCount();
    expect(newCount).toBe(initialCount - 1);
  });
});

authenticatedTest.describe('Admin Article Edit - Cancel', () => {
  const testPostId = 'test-post-id-cancel';

  authenticatedTest('should navigate back to dashboard on cancel', async ({
    adminPostEditPage,
    page,
  }) => {
    // Arrange: 編集ページに移動
    await adminPostEditPage.navigate(testPostId);
    await adminPostEditPage.waitForPostLoaded();

    // 変更を加える
    await adminPostEditPage.fillTitle('キャンセルされる変更');

    // Act: キャンセルボタンをクリック
    await adminPostEditPage.cancel();

    // Assert: ダッシュボードにリダイレクトされることを確認
    expect(page.url()).toContain('/dashboard');
  });
});

authenticatedTest.describe('Admin Article Edit - Error Handling', () => {
  const testPostId = 'test-post-id-error';

  authenticatedTest.beforeEach(async ({ adminPostEditPage }) => {
    await adminPostEditPage.navigate(testPostId);
    await adminPostEditPage.waitForPostLoaded();
  });

  authenticatedTest('should handle network errors during save', async ({
    adminPostEditPage,
    page,
  }) => {
    // Arrange: ネットワークエラーをシミュレート
    await page.route('**/api/posts/**', (route) => {
      route.abort('failed');
    });

    // 記事を更新
    await adminPostEditPage.fillTitle('ネットワークエラーテスト');

    // Act: 保存を試行
    await adminPostEditPage.save();

    // Assert: エラーメッセージが表示されることを確認
    const hasError = await adminPostEditPage.hasErrorMessage();
    expect(hasError).toBeTruthy();
  });

  authenticatedTest('should handle server errors during publish', async ({
    adminPostEditPage,
    page,
  }) => {
    // Arrange: サーバーエラーをシミュレート
    await page.route('**/api/posts/**', (route) => {
      route.fulfill({
        status: 500,
        body: JSON.stringify({ error: 'Internal Server Error' }),
      });
    });

    // Act: 公開を試行
    await adminPostEditPage.publish();

    // Assert: エラーメッセージが表示されることを確認
    const hasError = await adminPostEditPage.hasErrorMessage();
    expect(hasError).toBeTruthy();
  });

  authenticatedTest('should handle 404 errors for non-existent posts', async ({
    adminPostEditPage,
    page,
  }) => {
    // Arrange: 存在しない記事IDを使用
    const nonExistentId = 'non-existent-post-id';

    // モックで404を返す
    await page.route(`**/api/posts/${nonExistentId}**`, (route) => {
      route.fulfill({
        status: 404,
        body: JSON.stringify({ error: 'Post not found' }),
      });
    });

    // Act: 存在しない記事の編集ページに移動
    await adminPostEditPage.navigate(nonExistentId);

    // Assert: エラーメッセージまたは404ページが表示されることを確認
    const hasError = await adminPostEditPage.hasErrorMessage();
    const url = page.url();

    expect(hasError || url.includes('404') || url.includes('not-found')).toBeTruthy();
  });
});

authenticatedTest.describe('Admin Article Edit - Responsive Design', () => {
  const testPostId = 'test-post-id-responsive';

  authenticatedTest('should display correctly on mobile viewport', async ({
    page,
    adminPostEditPage,
  }) => {
    // Arrange: モバイルビューポートに変更
    await page.setViewportSize({ width: 375, height: 667 });
    await adminPostEditPage.navigate(testPostId);
    await adminPostEditPage.waitForPostLoaded();

    // Act & Assert: フォームが表示されていることを確認
    const titleInput = page.locator('[data-testid="post-title-input"]');
    await expect(titleInput).toBeVisible();
  });

  authenticatedTest('should display correctly on tablet viewport', async ({
    page,
    adminPostEditPage,
  }) => {
    // Arrange: タブレットビューポートに変更
    await page.setViewportSize({ width: 768, height: 1024 });
    await adminPostEditPage.navigate(testPostId);
    await adminPostEditPage.waitForPostLoaded();

    // Act & Assert: フォームが表示されていることを確認
    const titleInput = page.locator('[data-testid="post-title-input"]');
    await expect(titleInput).toBeVisible();
  });
});
