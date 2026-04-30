import { test, expect } from '../fixtures';
import { resetMockPosts } from '../mocks/mockData';
import {
  getTiptapEditor,
  setEditorContent,
} from '../utils/tiptapHelpers';

/**
 * Admin の Edit/Preview タブで、Preview パネルが markdown を
 * react-markdown 経由で rendered HTML として表示することを確認。
 *
 * NOTE: Astro 公開ページとは markdown→HTML エンジンが異なるため
 * pixel-perfect ではないが、典型的な要素 (見出し / コード / 引用 / リスト) が
 * レンダリングされていることを保証する。
 */

test.describe('Admin Tiptap Editor - preview parity', () => {
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

  test('見出し / コードブロック / 引用 / リストが Preview に表示される', async ({
    page,
  }) => {
    await page.goto('/posts/new');
    await expect(getTiptapEditor(page)).toBeVisible();

    const sample = [
      '## H2 見出し',
      '',
      '本文段落です。',
      '',
      '> 引用 line',
      '',
      '```',
      'code line',
      '```',
      '',
      '- リスト1',
      '- リスト2',
    ].join('\n');

    await setEditorContent(page, sample);
    await page.getByTestId('editor-tab-preview').click();

    const preview = page.getByTestId('markdown-preview');
    await expect(preview).toBeVisible();
    await expect(preview.locator('h2')).toContainText('H2 見出し');
    await expect(preview.locator('blockquote')).toContainText('引用 line');
    await expect(preview.locator('pre code')).toContainText('code line');
    await expect(preview.locator('ul li').first()).toContainText('リスト1');
    await expect(preview.locator('ul li').nth(1)).toContainText('リスト2');
  });
});
