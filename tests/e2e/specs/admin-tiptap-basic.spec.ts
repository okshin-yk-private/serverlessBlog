import { test, expect } from '../fixtures';
import { resetMockPosts } from '../mocks/mockData';
import {
  getTiptapEditor,
  setEditorContent,
  getEditorMarkdown,
  expectEditorMarkdownToContain,
} from '../utils/tiptapHelpers';

/**
 * Admin Tiptap Editor - Basic Smoke
 *
 * - エディタが起動する (toolbar + contenteditable)
 * - markdown 入力 → 保存形式の markdown 出力
 * - Toolbar の太字ボタン適用
 * - Edit / Preview タブ切替
 */

test.describe('Admin Tiptap Editor - basic', () => {
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

  test('エディタが起動して contenteditable とツールバーが表示される', async ({
    page,
  }) => {
    await page.goto('/posts/new');
    await expect(page.getByTestId('tiptap-editor')).toBeVisible();
    await expect(page.getByTestId('tiptap-toolbar')).toBeVisible();
    await expect(getTiptapEditor(page)).toBeVisible();
  });

  test('入力した markdown が round-trip で取得できる', async ({ page }) => {
    await page.goto('/posts/new');
    await expect(getTiptapEditor(page)).toBeVisible();

    await setEditorContent(
      page,
      '## 見出し2\n\n本文段落\n\n- 項目A\n- 項目B'
    );
    await expectEditorMarkdownToContain(page, '見出し2');
    await expectEditorMarkdownToContain(page, '項目A');
    await expectEditorMarkdownToContain(page, '項目B');
  });

  test('toolbar の太字ボタンで bold が適用される', async ({ page }) => {
    await page.goto('/posts/new');
    await expect(getTiptapEditor(page)).toBeVisible();

    await setEditorContent(page, 'hello');
    // 全選択
    await getTiptapEditor(page).click();
    await page.keyboard.press(
      process.platform === 'darwin' ? 'Meta+a' : 'Control+a'
    );
    await page.getByTestId('toolbar-bold').click();

    const md = await getEditorMarkdown(page);
    expect(md).toMatch(/\*\*hello\*\*/);
  });

  test('Edit / Preview タブが切り替わる', async ({ page }) => {
    await page.goto('/posts/new');
    await expect(page.getByTestId('tiptap-editor')).toBeVisible();
    await setEditorContent(page, '## プレビュー見出し');

    // Preview に切替
    await page.getByTestId('editor-tab-preview').click();
    await expect(page.getByTestId('markdown-preview')).toBeVisible();
    await expect(page.getByTestId('markdown-preview')).toContainText(
      'プレビュー見出し'
    );

    // Edit に戻す
    await page.getByTestId('editor-tab-edit').click();
    await expect(page.getByTestId('markdown-preview')).not.toBeVisible();
    await expect(page.getByTestId('tiptap-editor')).toBeVisible();
  });
});
