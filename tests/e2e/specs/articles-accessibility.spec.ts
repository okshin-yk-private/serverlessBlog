import { test, expect } from '../fixtures';
import { assertNoA11yViolations } from '../utils/axeHelpers';

test('Home and Articles expose accessible controls in both themes', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  for (const theme of ['light', 'dark']) {
    if (theme === 'dark')
      await page.getByRole('button', { name: 'テーマを切り替える' }).click();
    for (const path of ['/', '/articles/']) {
      await page.goto(path);
      await assertNoA11yViolations(page);
    }
  }
});

test('Home and Articles reflow with text enlarged to 200 percent', async ({
  page,
}) => {
  await page.setViewportSize({ width: 640, height: 900 });
  for (const path of ['/', '/articles/']) {
    await page.goto(path);
    // Text resizing exercises content growth independently of viewport-only checks.
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth
      )
    ).toBeLessThanOrEqual(0);
    if (path === '/articles/')
      await expect(page.getByRole('searchbox')).toBeVisible();
  }
});

for (const width of [390, 1440]) {
  test(`calendar and search reserve their space before JavaScript at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/*.js', async (route) => {
      await gate;
      await route.continue();
    });
    await page.goto('/articles/', { waitUntil: 'commit' });
    await expect(page.locator('h1')).toBeVisible();
    // Wait for CSS before measuring; JS is deliberately still blocked.
    await expect
      .poll(() =>
        page.evaluate(() =>
          [
            ...document.querySelectorAll<HTMLLinkElement>(
              'link[rel=stylesheet]'
            ),
          ].every((link) => link.sheet !== null)
        )
      )
      .toBe(true);
    await page.evaluate(() => document.fonts.ready);
    const before = await page.locator('#article-records').boundingBox();
    release();
    await expect(page.locator('#publication-calendar')).toHaveAttribute(
      'data-ready',
      'true'
    );
    await expect(page.getByRole('searchbox')).toBeVisible();
    const after = await page.locator('#article-records').boundingBox();
    expect(Math.abs(after!.y - before!.y)).toBeLessThanOrEqual(2);
  });
}
