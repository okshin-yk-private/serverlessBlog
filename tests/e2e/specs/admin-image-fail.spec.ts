import { test, expect } from '../fixtures';
import { resetMockPosts } from '../mocks/mockData';
import {
  getTiptapEditor,
  getEditorMarkdown,
  pasteImage,
} from '../utils/tiptapHelpers';
import { fixturePng } from '../utils/imageFixtures';

/**
 * Admin Tiptap Editor — Image Failure & Validation
 *
 * - upload-url が 500 を返す場合: プレースホルダが除去され、再試行ボタン付き alert が表示される
 * - サイズ超過 (>5MB): バリデーションエラーが alert に表示され、アップロードは試行されない
 */

test.describe('Admin Tiptap Editor - image failure', () => {
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

  test('upload-url が 500 を返すとプレースホルダが除去され再試行 alert が表示される', async ({
    page,
  }) => {
    // MSW handler は __force_500__ prefix のファイル名で 500 を返す
    await page.goto('posts/new');
    await expect(getTiptapEditor(page)).toBeVisible();

    await pasteImage(page, fixturePng({ name: '__force_500__paste.png' }));

    const alert = page.getByTestId('image-upload-error');
    await expect(alert).toBeVisible({ timeout: 5000 });
    await expect(alert).toContainText('画像のアップロードに失敗しました');
    await expect(page.getByTestId('image-upload-retry')).toBeVisible();

    // プレースホルダ画像 (blob: URL) も最終 URL も入っていない
    await expect
      .poll(async () => getEditorMarkdown(page), { timeout: 3000 })
      .not.toMatch(/!\[[^\]]*\]\(blob:/);
    // spinner も残っていない
    await expect(page.getByTestId('image-upload-spinner')).toHaveCount(0);
  });

  test('5MB を超える画像は validation で拒否されアップロードが行われない', async ({
    page,
  }) => {
    let uploadUrlCalled = 0;
    page.on('request', (req) => {
      if (req.url().includes('/admin/images/upload-url')) {
        uploadUrlCalled += 1;
      }
    });

    await page.goto('posts/new');
    await expect(getTiptapEditor(page)).toBeVisible();

    // 6MB のファイル (5MB cap を超える)
    await pasteImage(page, fixturePng({ name: 'oversize.png', sizeKB: 6000 }));

    const alert = page.getByTestId('image-upload-error');
    await expect(alert).toBeVisible({ timeout: 3000 });
    await expect(alert).toContainText('5MB');
    expect(uploadUrlCalled).toBe(0);
    // ノードは挿入されていない
    await expect(page.getByTestId('image-upload-spinner')).toHaveCount(0);
  });
});
