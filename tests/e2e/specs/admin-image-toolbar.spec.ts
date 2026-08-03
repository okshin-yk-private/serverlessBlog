import { test, expect } from '../fixtures';
import { resetMockPosts } from '../mocks/mockData';
import { getTiptapEditor, getEditorMarkdown } from '../utils/tiptapHelpers';
import { fixturePng } from '../utils/imageFixtures';

/**
 * Admin Tiptap Editor — Toolbar Image Insert
 *
 * ツールバーの画像挿入ボタン → 隠し file input → UploadImage 命令経由で
 * 最終 URL が markdown に挿入される一連を確認する。
 */

test.describe('Admin Tiptap Editor - toolbar image button', () => {
  const testCredentials = {
    email: process.env.TEST_ADMIN_EMAIL || 'admin@example.com',
    password: process.env.TEST_ADMIN_PASSWORD || 'testpassword',
  };

  // MSW のデフォルト upload-url ハンドラが返す imageUrl 形式
  const FINAL_IMAGE_URL =
    'https://mock-cdn.cloudfront.net/images/toolbar-test.png';

  test.beforeEach(async ({ adminLoginPage }) => {
    resetMockPosts();
    await adminLoginPage.navigate();
    await adminLoginPage.clearCredentials();
    await adminLoginPage.login(testCredentials.email, testCredentials.password);
    // 画像 PUT は MSW handlers.ts の `_mock_s3_put/:filename` ハンドラが処理する。
  });

  test('ツールバーの画像ボタンから選んだファイルが markdown に挿入される', async ({
    page,
  }) => {
    await page.goto('posts/new');
    await expect(getTiptapEditor(page)).toBeVisible();

    await expect(page.getByTestId('toolbar-image-button')).toBeVisible();

    const png = fixturePng({ name: 'toolbar-test.png' });
    await page.getByTestId('toolbar-image-input').setInputFiles({
      name: png.name,
      mimeType: png.mimeType,
      buffer: png.buffer,
    });

    await expect
      .poll(async () => getEditorMarkdown(page), { timeout: 5000 })
      .toContain(FINAL_IMAGE_URL);

    await expect(page.getByTestId('image-upload-error')).toHaveCount(0);
  });
});
