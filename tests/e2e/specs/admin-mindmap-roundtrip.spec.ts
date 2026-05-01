import { test, expect } from '../fixtures';
import { resetMockPosts } from '../mocks/mockData';
import {
  getTiptapEditor,
  setEditorContent,
  getEditorMarkdown,
} from '../utils/tiptapHelpers';

/**
 * Mindmap マーカーが Tiptap を経由しても markdown 上に
 * 原文一致で残ること (Goldmark の `<p>{{mindmap:UUID}}</p>` 検出と整合)。
 */

test.describe('Admin Tiptap Editor - mindmap marker round-trip', () => {
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

  test('mindmap マーカー含む markdown が原文一致で round-trip する', async ({
    page,
  }) => {
    await page.goto('/posts/new');
    await expect(getTiptapEditor(page)).toBeVisible();

    const marker = '550e8400-e29b-41d4-a716-446655440000';
    const original = `本文 1 行目\n\n{{mindmap:${marker}}}\n\n本文 2 行目`;

    await setEditorContent(page, original);

    const md = await getEditorMarkdown(page);
    expect(md).toContain(`{{mindmap:${marker}}}`);
    expect(md).toContain('本文 1 行目');
    expect(md).toContain('本文 2 行目');
  });

  test('複数 mindmap マーカーがすべて保持される', async ({ page }) => {
    await page.goto('/posts/new');
    await expect(getTiptapEditor(page)).toBeVisible();

    const m1 = '550e8400-e29b-41d4-a716-446655440000';
    const m2 = '11111111-2222-3333-4444-555555555555';
    await setEditorContent(
      page,
      `intro\n\n{{mindmap:${m1}}}\n\nmiddle\n\n{{mindmap:${m2}}}\n\noutro`
    );

    const md = await getEditorMarkdown(page);
    expect(md).toContain(`{{mindmap:${m1}}}`);
    expect(md).toContain(`{{mindmap:${m2}}}`);
  });
});
