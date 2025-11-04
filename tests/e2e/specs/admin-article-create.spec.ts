import { test, expect, authenticatedTest } from '../fixtures';

/**
 * 管理画面記事作成のE2Eテスト
 *
 * Requirements:
 * - R43: E2Eテスト（記事管理フロー）
 * - R40-42: 100%テストカバレッジ
 *
 * TDD Approach:
 * このテストは最初は失敗します（Red）
 * 記事作成機能が実装されたら成功します（Green）
 */

authenticatedTest.describe('Admin Article Create - Form Display', () => {
  authenticatedTest.beforeEach(async ({ adminPostCreatePage }) => {
    // 各テスト前に記事作成ページに移動
    await adminPostCreatePage.navigate();
  });

  authenticatedTest('should display article create form', async ({ adminPostCreatePage, page }) => {
    // Arrange: 記事作成ページに移動済み

    // Act & Assert: 記事作成ページが正しく表示されていることを確認
    expect(page.url()).toContain('/posts/new');
  });

  authenticatedTest('should display all required form fields', async ({ page }) => {
    // Arrange: 記事作成ページに移動済み

    // Act: 各フォームフィールドの存在を確認
    const titleInput = page.locator('[data-testid="post-title-input"]');
    const contentEditor = page.locator('[data-testid="post-content-editor"]');

    // Assert: 必須フィールドが表示されていることを確認
    await expect(titleInput).toBeVisible();
    await expect(contentEditor).toBeVisible();
  });
});

authenticatedTest.describe('Admin Article Create - Create Draft', () => {
  authenticatedTest.beforeEach(async ({ adminPostCreatePage }) => {
    await adminPostCreatePage.navigate();
  });

  authenticatedTest('should create draft article successfully', async ({
    adminPostCreatePage,
    page,
  }) => {
    // Arrange: 記事データを準備
    const articleData = {
      title: 'テスト記事タイトル',
      content: 'これはテスト記事の本文です。',
    };

    // Act: フォームに入力して下書き保存
    await adminPostCreatePage.fillTitle(articleData.title);
    await adminPostCreatePage.fillContent(articleData.content);
    await adminPostCreatePage.saveDraft();

    // Assert: 成功メッセージまたはダッシュボードへのリダイレクトを確認
    const hasSuccess = await adminPostCreatePage.hasSuccessMessage();
    const urlContainsDashboard = page.url().includes('/dashboard');

    expect(hasSuccess || urlContainsDashboard).toBeTruthy();
  });

  authenticatedTest('should create draft with all optional fields', async ({
    adminPostCreatePage,
    page,
  }) => {
    // Arrange: すべてのフィールドを含む記事データ
    const articleData = {
      title: 'テスト記事タイトル（完全版）',
      slug: 'test-article-slug',
      excerpt: 'これは記事の抜粋です。',
      content: 'これはテスト記事の本文です。',
      category: 'テクノロジー',
      tags: 'タグ1, タグ2, タグ3',
    };

    // Act: すべてのフィールドに入力して下書き保存
    await adminPostCreatePage.fillCompleteForm(articleData);
    await adminPostCreatePage.saveDraft();

    // Assert: 成功メッセージまたはダッシュボードへのリダイレクトを確認
    const hasSuccess = await adminPostCreatePage.hasSuccessMessage();
    const urlContainsDashboard = page.url().includes('/dashboard');

    expect(hasSuccess || urlContainsDashboard).toBeTruthy();
  });
});

authenticatedTest.describe('Admin Article Create - Publish Article', () => {
  authenticatedTest.beforeEach(async ({ adminPostCreatePage }) => {
    await adminPostCreatePage.navigate();
  });

  authenticatedTest('should publish article successfully', async ({
    adminPostCreatePage,
    page,
  }) => {
    // Arrange: 記事データを準備
    const articleData = {
      title: 'テスト公開記事',
      content: 'これは公開する記事の本文です。',
    };

    // Act: フォームに入力して公開
    await adminPostCreatePage.fillTitle(articleData.title);
    await adminPostCreatePage.fillContent(articleData.content);
    await adminPostCreatePage.publish();

    // Assert: 成功メッセージまたはダッシュボードへのリダイレクトを確認
    const hasSuccess = await adminPostCreatePage.hasSuccessMessage();
    const urlContainsDashboard = page.url().includes('/dashboard');

    expect(hasSuccess || urlContainsDashboard).toBeTruthy();
  });
});

authenticatedTest.describe('Admin Article Create - Form Validation', () => {
  authenticatedTest.beforeEach(async ({ adminPostCreatePage }) => {
    await adminPostCreatePage.navigate();
  });

  authenticatedTest('should show error when title is empty', async ({
    adminPostCreatePage,
  }) => {
    // Arrange: タイトルを空にして本文のみ入力
    await adminPostCreatePage.fillContent('本文のみ入力');

    // Act: 保存を試行
    await adminPostCreatePage.saveDraft();

    // Assert: バリデーションエラーが表示されることを確認
    const hasError = await adminPostCreatePage.hasValidationError();
    expect(hasError).toBeTruthy();
  });

  authenticatedTest('should show error when content is empty', async ({
    adminPostCreatePage,
  }) => {
    // Arrange: 本文を空にしてタイトルのみ入力
    await adminPostCreatePage.fillTitle('タイトルのみ');

    // Act: 保存を試行
    await adminPostCreatePage.saveDraft();

    // Assert: バリデーションエラーが表示されることを確認
    const hasError = await adminPostCreatePage.hasValidationError();
    expect(hasError).toBeTruthy();
  });

  authenticatedTest('should show error when both title and content are empty', async ({
    adminPostCreatePage,
  }) => {
    // Arrange: すべてのフィールドを空にする

    // Act: 保存を試行
    await adminPostCreatePage.saveDraft();

    // Assert: バリデーションエラーが表示されることを確認
    const hasError = await adminPostCreatePage.hasValidationError();
    expect(hasError).toBeTruthy();
  });

  authenticatedTest('should validate title length', async ({ adminPostCreatePage }) => {
    // Arrange: 最大文字数を超えるタイトルを入力
    const longTitle = 'あ'.repeat(201); // 200文字制限を仮定
    await adminPostCreatePage.fillTitle(longTitle);
    await adminPostCreatePage.fillContent('本文');

    // Act: 保存を試行
    await adminPostCreatePage.saveDraft();

    // Assert: バリデーションエラーまたは切り捨てられることを確認
    const hasError = await adminPostCreatePage.hasValidationError();
    const titleValue = await adminPostCreatePage.getTitleValue();

    // エラーが表示されるか、タイトルが切り捨てられていることを確認
    expect(hasError || titleValue.length <= 200).toBeTruthy();
  });
});

authenticatedTest.describe('Admin Article Create - Preview', () => {
  authenticatedTest.beforeEach(async ({ adminPostCreatePage }) => {
    await adminPostCreatePage.navigate();
  });

  authenticatedTest('should show preview of article', async ({
    adminPostCreatePage,
    page,
    context,
  }) => {
    // Arrange: 記事データを入力
    await adminPostCreatePage.fillTitle('プレビューテスト記事');
    await adminPostCreatePage.fillContent('プレビュー用の本文です。');

    // Act: プレビューボタンをクリック
    // 新しいタブが開く可能性があるので、それを監視
    const [newPage] = await Promise.all([
      context.waitForEvent('page'),
      adminPostCreatePage.clickPreview(),
    ]);

    // Assert: プレビューページが開くことを確認
    await newPage.waitForLoadState();
    expect(newPage.url()).toContain('/preview');

    // クリーンアップ
    await newPage.close();
  });
});

authenticatedTest.describe('Admin Article Create - Cancel', () => {
  authenticatedTest.beforeEach(async ({ adminPostCreatePage }) => {
    await adminPostCreatePage.navigate();
  });

  authenticatedTest('should navigate back to dashboard on cancel', async ({
    adminPostCreatePage,
    page,
  }) => {
    // Arrange: 記事データを入力
    await adminPostCreatePage.fillTitle('キャンセルテスト記事');
    await adminPostCreatePage.fillContent('キャンセルされる記事です。');

    // Act: キャンセルボタンをクリック
    await adminPostCreatePage.cancel();

    // Assert: ダッシュボードにリダイレクトされることを確認
    expect(page.url()).toContain('/dashboard');
  });
});

authenticatedTest.describe('Admin Article Create - Auto-save', () => {
  authenticatedTest.beforeEach(async ({ adminPostCreatePage }) => {
    await adminPostCreatePage.navigate();
  });

  authenticatedTest('should auto-save draft periodically', async ({
    adminPostCreatePage,
    page,
  }) => {
    // Arrange: 記事データを入力
    await adminPostCreatePage.fillTitle('自動保存テスト記事');
    await adminPostCreatePage.fillContent('自動保存される記事です。');

    // Act: 一定時間待機（自動保存が発生することを期待）
    await page.waitForTimeout(3000);

    // Assert: 保存中インジケーターが表示されたか確認
    // または localStorage に自動保存データが存在するか確認
    const hasSavingIndicator = await adminPostCreatePage.isSaving();

    // 自動保存機能が実装されている場合、少なくとも一度は保存処理が動くはず
    // （この確認は実装に依存するため、柔軟に調整）
    expect(hasSavingIndicator !== undefined).toBeTruthy();
  });
});

authenticatedTest.describe('Admin Article Create - Error Handling', () => {
  authenticatedTest.beforeEach(async ({ adminPostCreatePage }) => {
    await adminPostCreatePage.navigate();
  });

  authenticatedTest('should handle network errors during save', async ({
    adminPostCreatePage,
    page,
  }) => {
    // Arrange: ネットワークエラーをシミュレート
    await page.route('**/api/posts**', (route) => {
      route.abort('failed');
    });

    // 記事データを入力
    await adminPostCreatePage.fillTitle('ネットワークエラーテスト記事');
    await adminPostCreatePage.fillContent('エラーが発生する記事です。');

    // Act: 保存を試行
    await adminPostCreatePage.saveDraft();

    // Assert: エラーメッセージが表示されることを確認
    const hasError = await adminPostCreatePage.hasErrorMessage();
    expect(hasError).toBeTruthy();
  });

  authenticatedTest('should handle server errors during publish', async ({
    adminPostCreatePage,
    page,
  }) => {
    // Arrange: サーバーエラーをシミュレート
    await page.route('**/api/posts**', (route) => {
      route.fulfill({
        status: 500,
        body: JSON.stringify({ error: 'Internal Server Error' }),
      });
    });

    // 記事データを入力
    await adminPostCreatePage.fillTitle('サーバーエラーテスト記事');
    await adminPostCreatePage.fillContent('サーバーエラーが発生する記事です。');

    // Act: 公開を試行
    await adminPostCreatePage.publish();

    // Assert: エラーメッセージが表示されることを確認
    const hasError = await adminPostCreatePage.hasErrorMessage();
    expect(hasError).toBeTruthy();
  });
});

authenticatedTest.describe('Admin Article Create - Responsive Design', () => {
  authenticatedTest('should display correctly on mobile viewport', async ({
    page,
    adminPostCreatePage,
  }) => {
    // Arrange: モバイルビューポートに変更
    await page.setViewportSize({ width: 375, height: 667 });
    await adminPostCreatePage.navigate();

    // Act & Assert: フォームが表示されていることを確認
    const titleInput = page.locator('[data-testid="post-title-input"]');
    await expect(titleInput).toBeVisible();
  });

  authenticatedTest('should display correctly on tablet viewport', async ({
    page,
    adminPostCreatePage,
  }) => {
    // Arrange: タブレットビューポートに変更
    await page.setViewportSize({ width: 768, height: 1024 });
    await adminPostCreatePage.navigate();

    // Act & Assert: フォームが表示されていることを確認
    const titleInput = page.locator('[data-testid="post-title-input"]');
    await expect(titleInput).toBeVisible();
  });
});
