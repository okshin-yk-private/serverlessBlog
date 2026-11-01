import { test, expect } from '../fixtures/csp';
import { getTiptapEditor, getEditorMarkdown } from '../utils/tiptapHelpers';
import { fixturePng } from '../utils/imageFixtures';

// The browser must never send traffic to real AWS/CDN services in this suite.
test.beforeEach(async ({ context }) => {
  await context.route(/^https?:\/\/(?!127\.0\.0\.1:4317(?:\/|$))/, (route) =>
    route.abort()
  );
});

test('strict public CSP permits search and persisted theme switching', async ({
  page,
}) => {
  const response = await page.goto('/articles/');
  expect(response?.headers()['content-security-policy']).toContain(
    "script-src 'self';"
  );
  const search = page.getByRole('searchbox');
  await expect(page.locator('#article-records article:visible')).toHaveCount(2);
  await search.fill('見つからない検索語');
  await expect(page.locator('#article-records article:visible')).toHaveCount(0);
  await search.press('Escape');
  await expect(search).toHaveValue('');
  const initial = await page.locator('html').getAttribute('data-theme');
  await page.locator('[data-theme-toggle]').first().click();
  await expect(page.locator('html')).not.toHaveAttribute(
    'data-theme',
    initial!
  );
  const changed = await page.locator('html').getAttribute('data-theme');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', changed!);
});

test('strict admin CSP permits mock login, editing and image upload', async ({
  page,
  adminLoginPage,
}) => {
  const response = await page.goto('/admin/login');
  expect(response?.headers()['content-security-policy']).toContain(
    "script-src 'self';"
  );
  await adminLoginPage.login('admin@example.com', 'testpassword');
  await expect(page).toHaveURL(/\/admin\/dashboard$/);
  await page.goto('/admin/posts/new');
  const editor = getTiptapEditor(page);
  await expect(editor).toBeVisible();
  await editor.fill('CSP local fixture draft');
  await expect
    .poll(() => getEditorMarkdown(page))
    .toContain('CSP local fixture draft');
  const png = fixturePng({ name: 'toolbar-test.png' });
  await page.getByTestId('toolbar-image-input').setInputFiles({
    name: png.name,
    mimeType: png.mimeType,
    buffer: png.buffer,
  });
  await expect
    .poll(() => getEditorMarkdown(page))
    .toContain('https://mock-cdn.cloudfront.net/images/toolbar-test.png');
  await expect(page.getByTestId('image-upload-error')).toHaveCount(0);
});
