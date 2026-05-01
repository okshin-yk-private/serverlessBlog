import { test, expect } from '../fixtures';
import { resetMockPosts } from '../mocks/mockData';
import {
  getTiptapEditor,
  getEditorMarkdown,
  pasteImage,
} from '../utils/tiptapHelpers';
import { fixturePng } from '../utils/imageFixtures';

/**
 * Admin Tiptap Editor — Image Paste
 *
 * クリップボードペースト経由で画像が UploadImage 拡張に取り込まれ、
 * S3 PUT 完了後に最終 URL が markdown に反映されることを確認する。
 */

test.describe('Admin Tiptap Editor - image paste', () => {
  const testCredentials = {
    email: process.env.TEST_ADMIN_EMAIL || 'admin@example.com',
    password: process.env.TEST_ADMIN_PASSWORD || 'testpassword',
  };

  // MSW のデフォルト upload-url ハンドラが返す imageUrl 形式
  const FINAL_IMAGE_URL =
    'https://mock-cdn.cloudfront.net/images/paste-test.png';

  test.beforeEach(async ({ adminLoginPage, page }) => {
    resetMockPosts();
    await adminLoginPage.navigate();
    await adminLoginPage.clearCredentials();
    await adminLoginPage.login(testCredentials.email, testCredentials.password);

    // S3 PUT (mock-s3-bucket.s3.amazonaws.com への直送) を同 origin リダイレクトで処理。
    // CORS preflight 回避のため、CORS 許可ヘッダ付きで 200 を返す。
    await page.route(/mock-s3-bucket\.s3\.amazonaws\.com/, async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'PUT, OPTIONS',
          'access-control-allow-headers': '*',
        },
        body: '',
      });
    });
  });

  test('画像を貼り付けると UploadImage が S3 PUT を経て最終 URL を markdown に挿入する', async ({
    page,
  }) => {
    await page.goto('/posts/new');
    await expect(getTiptapEditor(page)).toBeVisible();

    await pasteImage(page, fixturePng({ name: 'paste-test.png' }));

    // 最終 URL が markdown に出るまで待つ
    await expect
      .poll(async () => getEditorMarkdown(page), { timeout: 5000 })
      .toContain(FINAL_IMAGE_URL);

    // エラー alert は出ていない
    await expect(page.getByTestId('image-upload-error')).toHaveCount(0);
    // アップロード完了後に spinner が残っていない
    await expect(page.getByTestId('image-upload-spinner')).toHaveCount(0);
  });
});
