import { test, expect } from '../fixtures';
import {
  getEditorMarkdown,
  getTiptapEditor,
  setEditorContent,
} from '../utils/tiptapHelpers';

test.describe('Article links', () => {
  test.beforeEach(async ({ page, adminLoginPage }) => {
    // Fail closed if a test request escapes the local mock environment.
    await page.route('**/*', (route) => {
      const url = new URL(route.request().url());
      return ['localhost', '127.0.0.1'].includes(url.hostname)
        ? route.continue()
        : route.abort();
    });
    await adminLoginPage.navigate();
    await adminLoginPage.clearCredentials();
    await adminLoginPage.login('admin@example.com', 'testpassword');
    await page.goto('posts/new');
    await expect(getTiptapEditor(page)).toBeVisible();
  });

  test('inserts a link button, previews it, and saves its Markdown', async ({
    page,
  }, testInfo) => {
    await page.getByTestId('toolbar-link').click();
    await expect(page.getByTestId('link-dialog-text')).toBeFocused();
    await page.getByTestId('link-dialog-text').fill('価格.comで価格を比較する');
    await page
      .getByTestId('link-dialog-url')
      .fill('https://kakaku.com/item/K0000000001/');
    await page.getByTestId('link-dialog-style').selectOption('button');
    await page
      .getByTestId('link-dialog')
      .screenshot({ path: testInfo.outputPath('link-dialog-desktop.png') });
    // Enter submits only the dialog, not the containing article form.
    await page.getByTestId('link-dialog-url').press('Enter');
    await expect(page.getByTestId('link-dialog')).toHaveCount(0);
    await expect(page).toHaveURL(/posts\/new$/);
    await page.keyboard.type(' next');
    const link = getTiptapEditor(page).locator('a');
    await expect(link).toHaveClass('article-link-button');
    await expect(link).toHaveText('価格.comで価格を比較する');
    expect(await getEditorMarkdown(page)).toContain('){.link-button} next');
    await page.getByTestId('editor-tab-preview').click();
    const preview = page.getByTestId('markdown-preview');
    await expect(preview.locator('a')).toHaveAttribute(
      'href',
      'https://kakaku.com/item/K0000000001/'
    );
    await expect(preview.locator('a')).toHaveCSS(
      'text-decoration-line',
      'none'
    );
    expect(
      (await preview.locator('a').boundingBox())!.height
    ).toBeGreaterThanOrEqual(44);
    await preview.screenshot({
      path: testInfo.outputPath('link-preview-desktop.png'),
    });
    await page.getByTestId('post-title-input').fill('商品リンクの保存テスト');
    await page.getByTestId('post-category-select').selectOption('technology');
    const saved = page.waitForResponse(
      (response) =>
        response.url().endsWith('/admin/posts') &&
        response.request().method() === 'POST' &&
        response.status() === 201
    );
    await page.getByTestId('save-draft-button').click();
    const response = await saved;
    const payload = response.request().postDataJSON();
    expect(payload.contentMarkdown).toContain('){.link-button} next');
    const post = await response.json();
    await expect(page).toHaveURL(/\/posts$/);
    await page.getByTestId('draft-filter-tab').click();
    await page.locator(`a[href="/posts/edit/${post.id}"]`).first().click();
    await expect(
      getTiptapEditor(page).locator('a.article-link-button')
    ).toHaveText('価格.comで価格を比較する');
  });

  test('edits a selected link, preserves formatting, and removes just its link', async ({
    page,
  }) => {
    await setEditorContent(
      page,
      '前 [**Amazon**で商品を見る](https://www.amazon.co.jp/dp/example) 後'
    );
    await getTiptapEditor(page).locator('a').click();
    await page.getByTestId('toolbar-link').click();
    await expect(page.getByTestId('link-dialog-text')).toHaveValue(
      'Amazonで商品を見る'
    );
    await page
      .getByTestId('link-dialog-url')
      .fill('https://www.amazon.co.jp/dp/example?ref=article');
    await page.getByTestId('link-dialog-style').selectOption('button');
    await page.getByTestId('link-dialog-submit').click();
    await expect(getTiptapEditor(page).locator('a strong')).toHaveText(
      'Amazon'
    );
    await getTiptapEditor(page).locator('a').click();
    await page.getByTestId('toolbar-link').click();
    await page.getByTestId('link-dialog-remove').click();
    await expect(getTiptapEditor(page).locator('a')).toHaveCount(0);
    await expect(getTiptapEditor(page)).toHaveText('前 Amazonで商品を見る 後');
  });

  test('mobile modal traps focus, rejects unsafe links, and cancels on Escape', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByTestId('toolbar-link').click();
    await page.getByTestId('link-dialog-text').fill('Amazonで商品を見る');
    await page.getByTestId('link-dialog-url').fill('javascript:alert(1)');
    await page.getByTestId('link-dialog-submit').click();
    await expect(page.getByRole('alert')).toContainText('URLは');
    await page
      .getByTestId('link-dialog-url')
      .fill('https://www.amazon.co.jp/dp/example');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.getByTestId('link-dialog-style').selectOption('button');
    await page.getByTestId('link-dialog-submit').focus();
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('link-dialog-text')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.getByTestId('link-dialog-submit')).toBeFocused();
    expect(
      await page
        .getByTestId('link-dialog')
        .evaluate((el) => el.scrollWidth <= el.clientWidth)
    ).toBe(true);
    await page
      .getByTestId('link-dialog')
      .screenshot({ path: testInfo.outputPath('link-dialog-mobile.png') });
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('link-dialog')).toHaveCount(0);
    await expect(getTiptapEditor(page)).toBeFocused();
    expect(await getEditorMarkdown(page)).toBe('');
  });
});
