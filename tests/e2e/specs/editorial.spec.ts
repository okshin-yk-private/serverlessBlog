import { test, expect } from '../fixtures';

// Runs against the SSG mock build in playwright.config.ts, not AWS fixtures.
test.describe('Editorial archive', () => {
  test('combines category and search, clears via keyboard, and opens a result', async ({
    page,
  }) => {
    await page.goto('/');
    const rows = page.locator('#article-records article:visible');
    const search = page.getByRole('searchbox');
    const feature = page.getByTestId('feature-article');
    await expect(rows).toHaveCount(2);
    const category = page.getByRole('button', { name: 'tech', exact: true });
    await category.click();
    await expect(category).toHaveAttribute('aria-pressed', 'true');
    await expect(rows).toHaveCount(1);
    await search.fill('astro'); // Tag search.
    await expect(page.getByRole('status')).toHaveText('1件の記事（tech）');
    await search.fill('日本語'); // Exists in another category, but is excluded.
    await expect(rows).toHaveCount(0);
    await expect(page.getByTestId('no-results-message')).toBeVisible();
    await expect(feature).toBeVisible();
    await search.press('Escape');
    await expect(search).toHaveValue('');
    await expect(rows).toHaveCount(1);
    await search.fill('見つからない検索語');
    await expect(rows).toHaveCount(0);
    await page.getByRole('button', { name: '検索をクリア' }).click();
    await expect(search).toBeFocused();
    await expect(rows).toHaveCount(1);
    await page.getByRole('button', { name: 'すべて', exact: true }).click();
    await expect(rows).toHaveCount(2);
    await search.fill('日本語タイトル');
    await expect(rows).toHaveCount(1);
    await rows.getByRole('link').click();
    await expect(page).toHaveURL(/\/posts\/post-2\//);
    await expect(page.getByTestId('article-content')).toBeVisible();
  });

  for (const width of [320, 390, 1280]) {
    test(`fonts, theme persistence and no horizontal overflow at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({
        colorScheme: 'light',
        reducedMotion: 'reduce',
      });
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
      await expect(page.locator('h1')).toHaveCSS(
        'font-family',
        /Zen Kaku Gothic New/
      );
      await expect(
        page.getByTestId('feature-article').locator('.excerpt')
      ).toHaveCSS('font-family', /Zen Old Mincho/);
      // Check actual Japanese glyphs loaded, not just the declared CSS family.
      expect(
        await page.evaluate(async () => {
          const heading = await document.fonts.load(
            '700 32px "Zen Kaku Gothic New"',
            '日本語'
          );
          const body = await document.fonts.load(
            '400 16px "Zen Old Mincho"',
            '本文'
          );
          return (
            heading.length > 0 &&
            body.length > 0 &&
            [...heading, ...body].every((font) => font.status === 'loaded')
          );
        })
      ).toBe(true);
      for (const theme of ['light', 'dark']) {
        if (theme === 'dark') {
          await page
            .getByRole('button', { name: 'テーマを切り替える' })
            .click();
          await page.reload();
        }
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expect
          .poll(() =>
            page.evaluate(
              () =>
                document.documentElement.scrollWidth -
                document.documentElement.clientWidth
            )
          )
          .toBeLessThanOrEqual(0);
        await expect(page.getByRole('searchbox')).toBeVisible();
      }
    });
  }

  test('keeps every article navigable without JavaScript', async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      baseURL,
    });
    try {
      const page = await context.newPage();
      await page.goto('/');
      await expect(
        page.locator('#article-records article:visible')
      ).toHaveCount(2);
      await expect(page.getByRole('searchbox')).toBeHidden();
      await page.locator('#article-records a').first().click();
      await expect(page.getByTestId('article-content')).toBeVisible();
    } finally {
      await context.close();
    }
  });
});
