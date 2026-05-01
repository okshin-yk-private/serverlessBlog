import { test, expect } from '../fixtures';
import { resetMockPosts } from '../mocks/mockData';
import { getTiptapEditor, setEditorContent } from '../utils/tiptapHelpers';

/**
 * Admin Unsaved-Guard (PR5a)
 *
 * autosave がまだ走っていない状態でキャンセルボタンを押すと
 * window.confirm が出る。
 *
 * 注: React Router 7 の useBlocker は Data Router (createBrowserRouter)
 * 必須だが、本 admin app は BrowserRouter を使っているため、サイドバー
 * リンクなど任意の遷移をブロックする機能は本 PR ではスコープ外。
 * 本 PR では:
 *  - beforeunload (ブラウザ閉じ・リロード) → ブラウザ標準の警告
 *  - キャンセルボタン → window.confirm で明示確認
 * の 2 経路をカバーする。
 */

test.describe('Admin Unsaved-Guard', () => {
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

  test('未保存のままキャンセル → confirm が出る (dismiss で留まる)', async ({
    page,
  }) => {
    await page.goto('/posts/new');
    await expect(getTiptapEditor(page)).toBeVisible();

    // タイトルだけ入力 (本文空 → autosave は走らない → isDirty のまま)
    await page.getByTestId('post-title-input').fill('Dirty Title');

    let dialogMessage: string | null = null;
    page.once('dialog', async (dialog) => {
      dialogMessage = dialog.message();
      await dialog.dismiss();
    });

    await page.getByTestId('cancel-button').click();

    // dialog が出て、dismiss したので URL は変わらない
    await expect.poll(() => dialogMessage).toMatch(/未保存の変更/);
    await expect(page).toHaveURL(/\/posts\/new$/);
  });

  test('未保存のままキャンセル → confirm を accept で離脱する', async ({
    page,
  }) => {
    await page.goto('/posts/new');
    await expect(getTiptapEditor(page)).toBeVisible();

    await page.getByTestId('post-title-input').fill('Dirty Title');

    page.once('dialog', async (dialog) => {
      await dialog.accept();
    });

    await page.getByTestId('cancel-button').click();

    // accept したので /posts に遷移
    await expect(page).toHaveURL(/\/posts$/);
  });

  test('autosave 完了後にキャンセル → confirm 無しで遷移', async ({ page }) => {
    await page.goto('/posts/new');
    await expect(getTiptapEditor(page)).toBeVisible();

    // タイトル + 本文を入れて autosave 完走を待つ
    await page.getByTestId('post-title-input').fill('Will Autosave');
    await setEditorContent(page, '# 本文\n\nautosave 確認');

    // URL 置換を待つ = autosave 完了
    await expect(page).toHaveURL(/\/posts\/edit\/[^/]+$/, { timeout: 5000 });
    await expect(page.getByTestId('autosave-status')).toHaveText(/保存済み/, {
      timeout: 3000,
    });

    // confirm が出たら fail させる (出るべきでない)
    let dialogShown = false;
    page.on('dialog', async (dialog) => {
      dialogShown = true;
      await dialog.dismiss();
    });

    await page.getByTestId('cancel-button').click();

    await expect(page).toHaveURL(/\/posts$/);
    expect(dialogShown).toBe(false);
  });
});
