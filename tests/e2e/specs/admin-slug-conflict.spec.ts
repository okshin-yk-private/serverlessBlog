import { test, expect } from '../fixtures';
import { resetMockPosts } from '../mocks/mockData';
import { getTiptapEditor, setEditorContent } from '../utils/tiptapHelpers';

/**
 * Admin Slug Conflict (PR6)
 *
 * 既に同じ slug を持つ記事があるとき、新規記事を保存しようとすると 409 が
 * 返り、エラー banner に "slug already exists" が表示される。
 */

test.describe('Admin Slug Conflict', () => {
  const testCredentials = {
    email: process.env.TEST_ADMIN_EMAIL || 'admin@example.com',
    password: process.env.TEST_ADMIN_PASSWORD || 'testpassword',
  };

  test.beforeEach(async ({ adminLoginPage }) => {
    resetMockPosts();
    await adminLoginPage.navigate();
    await adminLoginPage.clearCredentials();
    await adminLoginPage.login(testCredentials.email, testCredentials.password);
  });

  test('重複 slug で保存すると 409 エラーバナーが出る', async ({ page }) => {
    await page.goto('posts/new');
    await expect(getTiptapEditor(page)).toBeVisible();
    // Seed an existing post in browser-side MSW state with the slug we'll
    // collide against. The bridge is exposed by main.tsx when MSW is on.
    await page.evaluate(() => {
      const seed = (
        window as unknown as { __e2eMockPosts?: { slug?: string }[] }
      ).__e2eMockPosts;
      if (!seed || !seed[0]) throw new Error('mockPosts bridge not exposed');
      seed[0].slug = 'taken-slug';
    });

    await page.getByTestId('post-title-input').fill('Conflict Test');
    await setEditorContent(page, '本文');
    // カテゴリを必須なので選択
    await page.getByTestId('post-category-select').selectOption({ index: 1 });
    // ロックを開けて重複 slug を入力
    await page.getByTestId('metadata-slug-lock').click();
    await page.getByTestId('metadata-slug-input').fill('taken-slug');

    await page.getByTestId('save-draft-button').click();

    await expect(page.getByTestId('error-message')).toContainText(
      'slug already exists'
    );
  });
});
