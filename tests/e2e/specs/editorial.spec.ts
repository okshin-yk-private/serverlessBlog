import { test, expect } from '../fixtures';

// Runs against the SSG mock build in playwright.config.ts, not AWS fixtures.
test.describe('Editorial archive', () => {
  test('combines category and search, clears via keyboard, and opens a result', async ({
    page,
  }) => {
    await page.goto('/articles/');
    const rows = page.locator('#article-records article:visible');
    const search = page.getByRole('searchbox');
    await expect(rows).toHaveCount(2);
    const category = page.getByRole('button', { name: 'tech', exact: true });
    await category.click();
    await expect(category).toHaveAttribute('aria-pressed', 'true');
    await expect(rows).toHaveCount(1);
    await search.fill('astro'); // Tag search.
    await expect(page.getByRole('status')).toHaveText('1 article (tech)');
    await search.fill('日本語'); // Exists in another category, but is excluded.
    await expect(rows).toHaveCount(0);
    await expect(page.getByTestId('no-results-message')).toBeVisible();
    await search.press('Escape');
    await expect(search).toHaveValue('');
    await expect(rows).toHaveCount(1);
    await search.fill('見つからない検索語');
    await expect(rows).toHaveCount(0);
    await page.getByRole('button', { name: 'Clear search' }).click();
    await expect(search).toBeFocused();
    await expect(rows).toHaveCount(1);
    await page.getByRole('button', { name: 'All', exact: true }).click();
    await expect(rows).toHaveCount(2);
    await search.fill('日本語タイトル');
    await expect(rows).toHaveCount(1);
    await rows.getByRole('link').click();
    await expect(page).toHaveURL(/\/posts\/post-2\//);
    await expect(page.getByTestId('article-content')).toBeVisible();
  });

  test('Home introduces the site and links to the dedicated Articles page', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('#intro-title')).toHaveText('bone of my fallacy');
    await expect(page.getByRole('searchbox')).toHaveCount(0);
    await expect(page.getByTestId('feature-article')).toHaveCount(1);
    await page.getByRole('link', { name: 'All articles' }).click();
    await expect(page).toHaveURL(/\/articles\//);
    await expect(page.locator('main #intro-title')).toHaveCount(0);
    await expect(page.locator('nav a[aria-current="page"]')).toHaveText(
      'Articles'
    );
  });

  test('publication date intersects search/category and can be reset independently', async ({
    page,
  }) => {
    await page.goto('/articles/');
    const rows = page.locator('#article-records article:visible');
    await page.getByRole('button', { name: 'tech', exact: true }).click();
    await page.getByRole('searchbox').fill('astro');
    await page.getByLabel('表示する年').selectOption('2024');
    const date = page.locator('button[data-day="2024-01-02"]');
    await date.click();
    await expect(rows).toHaveCount(0);
    await expect(date).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#publication-date')).toHaveValue('2024-01-02');
    await page.getByRole('button', { name: 'Clear date filter' }).click();
    await expect(rows).toHaveCount(1);
    await expect(page.locator('#publication-date')).toBeFocused();
    await page.locator('#publication-date').fill('2024-01-02');
    await expect(rows).toHaveCount(0);
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(rows).toHaveCount(2);
    await expect(page.getByRole('searchbox')).toBeFocused();
    const first = page.locator('button[data-day="2024-01-01"]');
    await first.focus();
    await first.press('ArrowDown');
    await expect(date).toBeFocused();
    await date.press('Enter');
    await expect(rows).toHaveCount(1);
    await expect(
      page.locator('.calendar-weeks button[tabindex="0"]')
    ).toHaveCount(1);
    await rows.getByRole('link').click();
    await page.getByRole('link', { name: '記事一覧へ' }).click();
    await expect(page).toHaveURL(/\/articles\//);
  });

  test('mobile calendar exposes each quarter without squeezing the year', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto('/articles/');
    await page.getByLabel('表示する年').selectOption('2024');
    const previous = page.getByRole('button', { name: '前の3か月' });
    while (await previous.isEnabled()) await previous.click();
    await expect(page.locator('#calendar-period')).toHaveText('1月 – 3月');
    await expect(page.locator('.calendar-week')).toHaveCount(13);
    await page.locator('button[data-day="2024-01-02"]').click();
    await expect(page.locator('#article-records article:visible')).toHaveCount(
      1
    );
    await page.getByRole('button', { name: '次の3か月' }).click();
    await expect(page.locator('#calendar-period')).toHaveText('4月 – 6月');
    await expect(page.locator('#publication-date')).toHaveValue('2024-01-02');
  });

  for (const width of [320, 390, 768, 1440]) {
    test(`fonts, theme persistence and no horizontal overflow at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({
        colorScheme: 'light',
        reducedMotion: 'reduce',
      });
      await page.goto('/articles/');
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
      await expect(page.locator('h1')).toHaveCSS(
        'font-family',
        /Zen Kaku Gothic New/
      );
      await expect(
        page.getByTestId('article-card').first().locator('.excerpt')
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
        const cellSizes = await page
          .locator('.calendar-live .calendar-cell:not(.calendar-padding)')
          .evaluateAll((cells) =>
            cells.map((cell) => {
              const { width, height } = cell.getBoundingClientRect();
              return { width, height };
            })
          );
        // Month labels must not enlarge their week's cells. Allow subpixel rounding.
        expect(cellSizes.length).toBeGreaterThan(0);
        const widths = cellSizes.map((cell) => cell.width);
        const heights = cellSizes.map((cell) => cell.height);
        expect(Math.max(...widths) - Math.min(...widths)).toBeLessThan(0.1);
        expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(0.1);
        expect(
          Math.max(
            ...cellSizes.map((cell) => Math.abs(cell.width - cell.height))
          )
        ).toBeLessThan(0.1);
        for (const path of ['/', '/about/', '/posts/post-2/', '/404.html']) {
          await page.goto(path);
          await expect(page.locator('html')).toHaveAttribute(
            'data-theme',
            theme
          );
          expect(
            await page.evaluate(
              () =>
                document.documentElement.scrollWidth -
                document.documentElement.clientWidth
            )
          ).toBeLessThanOrEqual(0);
        }
        await page.goto('/articles/');
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
      await page.goto('/articles/');
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
