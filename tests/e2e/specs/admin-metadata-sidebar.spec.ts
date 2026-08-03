import { test, expect } from '../fixtures';
import { resetMockPosts } from '../mocks/mockData';
import { getTiptapEditor, setEditorContent } from '../utils/tiptapHelpers';

/**
 * Admin Metadata Sidebar (PR6)
 *
 * - タイトルからslug が自動生成される (ロック OFF)
 * - ロックすると手動編集可能、タイトル変更で上書きされない
 * - excerpt 161字でカウンターが赤になる
 * - 「本文先頭画像から」ボタンで cover image URL が埋まる
 */

test.describe('Admin Metadata Sidebar', () => {
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

  test('タイトル入力で slug が自動生成される', async ({ page }) => {
    await page.goto('posts/new');
    await expect(getTiptapEditor(page)).toBeVisible();

    await page.getByTestId('post-title-input').fill('Hello PR6 World');
    const slugInput = page.getByTestId('metadata-slug-input');
    await expect(slugInput).toHaveValue('hello-pr6-world');
  });

  test('ロック解除→ロック後の slug は手動編集できる', async ({ page }) => {
    await page.goto('posts/new');
    await expect(getTiptapEditor(page)).toBeVisible();

    await page.getByTestId('post-title-input').fill('First Title');
    const slug = page.getByTestId('metadata-slug-input');
    await expect(slug).toHaveValue('first-title');

    // ロックして手動編集
    await page.getByTestId('metadata-slug-lock').click();
    await expect(page.getByTestId('metadata-slug-lock')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await slug.fill('manual-slug-2026');

    // タイトルを変更しても slug は変わらない
    await page.getByTestId('post-title-input').fill('Different Title');
    await expect(slug).toHaveValue('manual-slug-2026');
  });

  test('excerpt が161字でカウンターが赤くなる', async ({ page }) => {
    await page.goto('posts/new');
    await expect(getTiptapEditor(page)).toBeVisible();

    const excerpt = page.getByTestId('metadata-excerpt-input');
    await excerpt.fill('a'.repeat(161));
    const counter = page.getByTestId('metadata-excerpt-counter');
    await expect(counter).toHaveClass(/admin-field-error/);
    await expect(counter).toHaveText('161 / 160');
  });

  test('本文先頭画像から cover image を自動入力できる', async ({ page }) => {
    await page.goto('posts/new');
    await expect(getTiptapEditor(page)).toBeVisible();

    await page.getByTestId('post-title-input').fill('Cover Test');
    await setEditorContent(
      page,
      '![hero](https://cdn.example.com/cover.jpg)\n\n本文。'
    );

    await page.getByTestId('metadata-cover-autofill').click();
    await expect(page.getByTestId('metadata-cover-input')).toHaveValue(
      'https://cdn.example.com/cover.jpg'
    );
    await expect(page.getByTestId('metadata-cover-preview')).toBeVisible();
  });
});
