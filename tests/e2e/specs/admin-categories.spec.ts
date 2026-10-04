import { test, expect } from '../fixtures';
import { resetMockCategories } from '../mocks/mockData';

/**
 * 管理画面カテゴリ CRUD の最小限 E2E テスト
 *
 * R43 に従い「重要なユーザーフローのみ」をカバーする：
 * - 一覧表示
 * - 新規作成
 * - 編集（名前変更）
 * - 削除
 *
 * 並べ替え D&D は単体テスト (CategoryListPage.test.tsx) でカバー済み。
 *
 * Test data prefix: AWS 実環境でも実行されるため、`[E2E-TEST]` プレフィックスを
 * 名前に含めて識別・後処理可能にする (global-teardown が拾う想定)。
 *
 * Requirements:
 * - R43: UI E2E テスト（最小限）（カテゴリ管理）
 */

const E2E_TEST_PREFIX = '[E2E-TEST]';

test.describe('Admin Categories - CRUD', () => {
  const testCredentials = {
    email: process.env.TEST_ADMIN_EMAIL || 'admin@example.com',
    password: process.env.TEST_ADMIN_PASSWORD || 'testpassword',
  };

  test.beforeEach(async ({ adminLoginPage }) => {
    // MSW: 各テスト間でカテゴリ状態を独立させる
    resetMockCategories();

    await adminLoginPage.navigate();
    await adminLoginPage.clearCredentials();
    // login() は内部で /dashboard 遷移完了まで待つ
    await adminLoginPage.login(testCredentials.email, testCredentials.password);
  });

  test('一覧に既存カテゴリが表示される', async ({ adminCategoryListPage }) => {
    // Act
    await adminCategoryListPage.navigate();

    // Assert: シードカテゴリ (technology / life / business) が見える
    const count = await adminCategoryListPage.getCategoryCount();
    expect(count).toBeGreaterThan(0);

    const names = await adminCategoryListPage.getCategoryNames();
    expect(names.length).toBe(count);
  });

  test('新規作成すると一覧に反映される', async ({
    adminCategoryListPage,
    adminCategoryEditPage,
  }) => {
    const newName = `${E2E_TEST_PREFIX} cat-create-${Date.now()}`;

    // Arrange
    await adminCategoryListPage.navigate();
    const initialCount = await adminCategoryListPage.getCategoryCount();

    // Act: 新規ボタン → フォーム入力 → 保存
    await adminCategoryListPage.clickNewCategoryButton();
    await adminCategoryEditPage.fillName(newName);
    await adminCategoryEditPage.submitAndWaitForList();

    // Assert: 件数 +1 かつ作成名が一覧に存在
    const newCount = await adminCategoryListPage.getCategoryCount();
    expect(newCount).toBe(initialCount + 1);
    expect(await adminCategoryListPage.hasCategoryWithName(newName)).toBe(true);
  });

  test('編集で名前を更新すると一覧に反映される', async ({
    adminCategoryListPage,
    adminCategoryEditPage,
  }) => {
    const seedName = `${E2E_TEST_PREFIX} cat-edit-seed-${Date.now()}`;
    const updatedName = `${E2E_TEST_PREFIX} cat-edit-updated-${Date.now()}`;

    // Arrange: 編集対象の一意なカテゴリを 1 件作成
    await adminCategoryListPage.navigate();
    await adminCategoryListPage.clickNewCategoryButton();
    await adminCategoryEditPage.fillName(seedName);
    await adminCategoryEditPage.submitAndWaitForList();
    expect(await adminCategoryListPage.hasCategoryWithName(seedName)).toBe(
      true
    );

    // Act: その行の編集 → 名前変更 → 保存
    await adminCategoryListPage.clickEditByName(seedName);
    await adminCategoryEditPage.fillName(updatedName);
    await adminCategoryEditPage.submitAndWaitForList();

    // Assert: 旧名が消え、新名が見える
    expect(await adminCategoryListPage.hasCategoryWithName(updatedName)).toBe(
      true
    );
    expect(await adminCategoryListPage.hasCategoryWithName(seedName)).toBe(
      false
    );
  });

  test('削除するとカテゴリが一覧から消える', async ({
    adminCategoryListPage,
    adminCategoryEditPage,
  }) => {
    const targetName = `${E2E_TEST_PREFIX} cat-delete-${Date.now()}`;

    // Arrange: 削除対象の一意なカテゴリを 1 件作成
    await adminCategoryListPage.navigate();
    await adminCategoryListPage.clickNewCategoryButton();
    await adminCategoryEditPage.fillName(targetName);
    await adminCategoryEditPage.submitAndWaitForList();
    const beforeCount = await adminCategoryListPage.getCategoryCount();

    // Act
    await adminCategoryListPage.deleteByName(targetName);
    await adminCategoryListPage.waitForSuccessMessage();

    // Assert: 件数 -1 かつ対象が消えている
    await expect(async () => {
      const afterCount = await adminCategoryListPage.getCategoryCount();
      expect(afterCount).toBe(beforeCount - 1);
    }).toPass({ timeout: 5000 });
    expect(await adminCategoryListPage.hasCategoryWithName(targetName)).toBe(
      false
    );
  });
  test('画面復帰でカテゴリーを再取得し、執筆中の内容と選択を保持する', async ({
    adminPostCreatePage,
    page,
  }) => {
    test.skip(
      process.env.VITE_ENABLE_MSW_MOCK === 'false',
      'Local MSW fixture only'
    );
    await adminPostCreatePage.navigate();
    await adminPostCreatePage.fillTitle('編集中のタイトル');
    await adminPostCreatePage.fillContent('保存前の本文');
    await expect(
      page.locator(
        '[data-testid="post-category-select"] option[value="technology"]'
      )
    ).toBeAttached();
    await adminPostCreatePage.selectCategory('technology');

    // Change the mock server while the editor remains mounted, as when a
    // category is created elsewhere. No article save or build is involved.
    const created = await page.evaluate(async () => {
      const response = await fetch('/admin/categories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionStorage.getItem('auth_session_token')}`,
        },
        body: JSON.stringify({
          name: '復帰後の新カテゴリー',
          slug: 'category-on-return',
        }),
      });
      return response.status;
    });
    expect(created).toBe(201);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    const category = page.getByTestId('post-category-select');
    await expect(
      category.locator('option[value="category-on-return"]')
    ).toHaveText('復帰後の新カテゴリー');
    await expect(category).toHaveValue('technology');
    await expect(page.getByTestId('post-title-input')).toHaveValue(
      '編集中のタイトル'
    );
    await expect(
      page.locator('[data-testid="tiptap-editor"] [contenteditable="true"]')
    ).toContainText('保存前の本文');
  });
});

test.describe('Admin category layout (local MSW)', () => {
  test.skip(
    process.env.VITE_ENABLE_MSW_MOCK === 'false',
    'Local UI checks only'
  );
  test.beforeEach(async ({ adminLoginPage, adminCategoryListPage }) => {
    await adminLoginPage.navigate();
    await adminLoginPage.clearCredentials();
    await adminLoginPage.login('admin@example.com', 'testpassword');
    await adminCategoryListPage.navigate();
  });

  test('編集フォームは幅変更後も入力を保持し、狭幅では選択行の直下に配置する', async ({
    page,
  }) => {
    await page.getByTestId('edit-category-button').last().click();
    await page.getByTestId('name-input').fill('幅変更中の未保存入力');
    await page.getByTestId('description-input').fill('説明の未保存入力');
    for (const theme of ['light', 'dark']) {
      await page.evaluate(
        (theme) => (document.documentElement.dataset.theme = theme),
        theme
      );
      for (const width of [320, 390, 781, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await expect(page.getByTestId('name-input')).toHaveValue(
          '幅変更中の未保存入力'
        );
        await expect(page.getByTestId('description-input')).toHaveValue(
          '説明の未保存入力'
        );
        const layout = await page.evaluate(() => {
          const row = document
            .querySelector('.category-row.is-selected')!
            .getBoundingClientRect();
          const form = document
            .querySelector('.category-editor')!
            .getBoundingClientRect();
          const available =
            document.querySelector('.category-page')!.clientWidth;
          return {
            overflow: document.documentElement.scrollWidth > innerWidth,
            available,
            row: { left: row.left, right: row.right, bottom: row.bottom },
            form: { left: form.left, top: form.top, right: form.right },
          };
        });
        expect(layout.overflow).toBe(false);
        if (layout.available <= 760) {
          expect(layout.form.top).toBeGreaterThanOrEqual(layout.row.bottom);
          expect(Math.abs(layout.form.left - layout.row.left)).toBeLessThan(2);
        } else expect(layout.form.left).toBeGreaterThan(layout.row.right);
      }
    }
    await page.getByTestId('cancel-button').click();
    await expect(page.getByTestId('category-form')).toHaveCount(0);
  });

  test('キーボードのドラッグと上下ボタンで並び替えを保存する', async ({
    page,
  }) => {
    const names = page.getByTestId('category-name');
    const original = await names.allTextContents();
    const handle = page.getByTestId('drag-handle').first();
    const targetId = await page
      .getByTestId('edit-category-button')
      .nth(1)
      .getAttribute('data-category-id');
    await handle.focus();
    await page.keyboard.press('Space');
    await expect(handle).toHaveAttribute('aria-pressed', 'true');
    // The sensor attaches its key listener asynchronously; let drag layout measurement settle.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        )
    );
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('[id^=DndLiveRegion]')).toContainText(
      `was moved over droppable area ${targetId}.`
    );
    await page.keyboard.press('Space');
    await expect(
      page.getByRole('status').filter({ hasText: '並び順を更新しました' })
    ).toBeVisible();
    await expect(names.nth(1)).toHaveText(original[0]);
    await page
      .getByRole('button', { name: `${original[0]}を上へ`, exact: true })
      .click();
    await expect(names.first()).toHaveText(original[0]);
    await expect(
      page.getByRole('button', { name: `${original[0]}を下へ`, exact: true })
    ).toBeEnabled();
  });

  test('Adminは非操作ラベルで、AccountからSecurityへ移動できる', async ({
    page,
  }) => {
    await expect(page.locator('.admin-area-label')).toHaveText(
      /管理画面.*Admin/s
    );
    expect(
      await page
        .locator('.admin-area-label')
        .evaluate((el) => el.closest('a,button') === null)
    ).toBe(true);
    const account = page.getByRole('button', { name: 'Account' });
    await account.click();
    await expect(
      page.getByRole('link', { name: 'Security', exact: true })
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(account).toBeFocused();
    await account.click();
    await page.getByRole('link', { name: 'Security', exact: true }).click();
    await expect(page).toHaveURL(/\/security$/);
    await expect(account).toHaveClass(/active/);
  });
});
