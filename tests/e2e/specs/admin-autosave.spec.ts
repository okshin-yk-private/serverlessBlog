import { test, expect } from '../fixtures';
import { resetMockPosts } from '../mocks/mockData';
import { getTiptapEditor, setEditorContent } from '../utils/tiptapHelpers';

/**
 * Admin Autosave (PR5a)
 *
 * - 入力停止後 1.5s 程度で `保存済み` ラベルに遷移する
 * - 新規記事は最初の autosave 完了で URL が /posts/edit/{id} に置換される
 * - 既存記事の編集中も 1.5s で保存される
 *
 * MSW モック環境前提。リロードを跨ぐ復元検証は MSW 側の state が
 * 初期化されてしまうため、本 spec のスコープ外。
 */

test.describe('Admin Autosave', () => {
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

  test('新規記事: タイトル+本文入力後、autosave で URL が /posts/edit/{id} に置換される', async ({
    page,
  }) => {
    await page.goto('/posts/new');
    await expect(getTiptapEditor(page)).toBeVisible();

    // 初期状態: 未保存
    const status = page.getByTestId('autosave-status');
    await expect(status).toHaveText(/未保存/);

    await page.getByTestId('post-title-input').fill('Autosave Test Title');
    await setEditorContent(page, '# Autosave\n\n本文サンプルです。');

    // 1.5s debounce 後に保存され URL が変わる
    await expect(page).toHaveURL(/\/posts\/edit\/[^/]+$/, { timeout: 5000 });

    // ステータスが "保存済み" になる
    await expect(status).toHaveText(/保存済み/, { timeout: 3000 });
  });

  test('既存記事の編集: 本文変更後 autosave で saved に遷移する', async ({
    page,
  }) => {
    // 既存記事を編集 (mockData の post-1 を利用)
    await page.goto('/posts/edit/post-1');
    await expect(getTiptapEditor(page)).toBeVisible();

    const status = page.getByTestId('autosave-status');
    // 初期状態は未保存 (load 時点では autosave hook の baseline と
    // 一致しているが、useState の初期化タイミングで dirty 扱いになる
    // 可能性がある。saved or 未保存のどちらでも許容)。

    // 本文を編集
    await setEditorContent(page, '# 変更後の見出し\n\n編集された本文。');

    // 1.5s debounce + αで saving → saved
    await expect(status).toHaveText(/保存済み/, { timeout: 5000 });
  });

  test('タイトルのみで本文が空の場合 autosave は走らない (isReady ガード)', async ({
    page,
  }) => {
    await page.goto('/posts/new');
    await expect(getTiptapEditor(page)).toBeVisible();

    await page.getByTestId('post-title-input').fill('Title Only');
    // 本文は空のまま

    // 3 秒待っても URL は変わらず、saved にもならない
    await page.waitForTimeout(3000);
    await expect(page).toHaveURL(/\/posts\/new$/);
    const status = page.getByTestId('autosave-status');
    await expect(status).toHaveText(/未保存/);
  });
});
