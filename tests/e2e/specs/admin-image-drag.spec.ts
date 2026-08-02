import { test, expect } from '../fixtures';
import { resetMockPosts } from '../mocks/mockData';
import {
  getTiptapEditor,
  getEditorMarkdown,
  dropImage,
} from '../utils/tiptapHelpers';
import { fixtureJpeg } from '../utils/imageFixtures';

/**
 * Admin Tiptap Editor — Image Drag & Drop
 *
 * ファイルドラッグ&ドロップで UploadImage が起動し、
 * 最終 URL が markdown に挿入されることを確認する。
 */

test.describe('Admin Tiptap Editor - image drop', () => {
  const testCredentials = {
    email: process.env.TEST_ADMIN_EMAIL || 'admin@example.com',
    password: process.env.TEST_ADMIN_PASSWORD || 'testpassword',
  };

  // MSW のデフォルト upload-url ハンドラが返す imageUrl 形式
  const FINAL_IMAGE_URL =
    'https://mock-cdn.cloudfront.net/images/drop-test.jpg';

  test.beforeEach(async ({ adminLoginPage }) => {
    resetMockPosts();
    await adminLoginPage.navigate();
    await adminLoginPage.clearCredentials();
    await adminLoginPage.login(testCredentials.email, testCredentials.password);
    // 画像 PUT は MSW handlers.ts の `_mock_s3_put/:filename` ハンドラが処理する。
  });

  test('画像をドロップすると UploadImage が S3 PUT を経て最終 URL を markdown に挿入する', async ({
    page,
  }) => {
    await page.goto('posts/new');
    await expect(getTiptapEditor(page)).toBeVisible();

    await dropImage(page, fixtureJpeg({ name: 'drop-test.jpg' }));

    await expect
      .poll(async () => getEditorMarkdown(page), { timeout: 5000 })
      .toContain(FINAL_IMAGE_URL);

    await expect(page.getByTestId('image-upload-error')).toHaveCount(0);
    await expect(page.getByTestId('image-upload-spinner')).toHaveCount(0);
  });
});
