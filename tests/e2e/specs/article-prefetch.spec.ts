import { test, expect } from '@playwright/test';

test('prefetches an article on hover while keeping ordinary navigation usable', async ({
  page,
}) => {
  await page.goto('/');
  const article = page.locator('.post-feature .post-title a');
  const href = await article.getAttribute('href');
  expect(href).toBeTruthy();
  await expect(article).toHaveAttribute('data-astro-prefetch', 'hover');

  // Observe a completed request before clicking, rather than only checking markup.
  const prefetched = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === href && response.status() === 200
  );
  await article.hover();
  await prefetched;
  await expect(page).toHaveURL(/\/$/);
  expect(new URL(page.url()).pathname).toBe('/');

  await article.click();
  await expect(page.locator('[data-testid="article-title"]')).toBeVisible();
  await page.locator('.back-link').click();
  await expect(page).toHaveURL(/\/articles\/$/);
  await expect(page.locator('#search-input')).toBeVisible();
  await page.locator('#search-input').fill('存在しない記事タイトル');
  await expect(page.locator('#article-records article:visible')).toHaveCount(0);
  await page.locator('#search-input').fill('');
  await expect(page.locator('#article-records article').first()).toBeVisible();
});
