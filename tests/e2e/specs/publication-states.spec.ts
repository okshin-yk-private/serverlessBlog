import { test, expect } from '../fixtures';
import { resolve } from 'node:path';
import { startStaticSite } from '../../../frontend/public-astro/scripts/lighthouse.mjs';

// Opt in after building these fixtures with tests/build-publication-states.ts.
test.skip(
  process.env.PUBLICATION_STATES !== 'true',
  'Requires isolated publication-state builds'
);
for (const count of [0, 1, 20]) {
  test(`publication state ${count} preserves content and reflows`, async ({
    page,
  }) => {
    const server = await startStaticSite(
      resolve(`test-results-publication-fixtures/${count}`)
    );
    try {
      const base = new URL(server.urls[0]).origin;
      await page.setViewportSize({ width: 320, height: 1000 });
      await page.goto(`${base}/articles/`);
      await expect(page.locator('#article-records article')).toHaveCount(count);
      await expect(page.getByRole('status')).toHaveText(
        `${count} ${count === 1 ? 'article' : 'articles'}`
      );
      if (count === 0) {
        await expect(page.getByTestId('no-articles')).toBeVisible();
        await expect(page.getByRole('searchbox')).toBeHidden();
      } else {
        await page.getByLabel('表示する年').selectOption('2024');
        const previous = page.getByRole('button', { name: '前の3か月' });
        while (await previous.isEnabled()) await previous.click();
        await page.locator('button[data-day="2024-01-02"]').click();
        await expect(
          page.locator('#article-records article:visible')
        ).toHaveCount(count === 20 ? 19 : count);
        if (count === 20)
          await expect(
            page.locator('#article-records').getByText('公開日不明')
          ).toHaveCount(1);
      }
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth
        )
      ).toBeLessThanOrEqual(0);
      await page.goto(`${base}/`);
      await expect(page.getByTestId('feature-article')).toHaveCount(
        count ? 1 : 0
      );
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth
        )
      ).toBeLessThanOrEqual(0);
      if (count) {
        await page
          .getByTestId('feature-article')
          .getByTestId('article-title')
          .getByRole('link')
          .click();
        expect(
          await page.evaluate(
            () =>
              document.documentElement.scrollWidth -
              document.documentElement.clientWidth
          )
        ).toBeLessThanOrEqual(0);
        await expect(
          page.getByTestId('article-content').getByRole('heading')
        ).toHaveText('本文の見出し');
      }
    } finally {
      await server.close();
    }
  });
}
