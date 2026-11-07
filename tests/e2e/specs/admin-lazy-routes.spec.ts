import { test, expect } from '../fixtures';

test.describe('Admin route loading', () => {
  // These tests control Vite's module responses, never real AWS/CDN resources.
  test.skip(
    process.env.VITE_ENABLE_MSW_MOCK === 'false',
    'Local module failure injection only'
  );

  test('loads the editor only after navigation, shows progress, and supports direct URLs', async ({
    page,
    adminLoginPage,
  }) => {
    const editorRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/src/pages/PostCreatePage.tsx'))
        editorRequests.push(request.url());
    });
    await adminLoginPage.navigate();
    await adminLoginPage.login('admin@example.com', 'testpassword');
    await expect(
      page.getByRole('link', { name: '+ 新規記事作成', exact: true })
    ).toBeVisible();
    expect(editorRequests).toHaveLength(0);

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page
      .context()
      .route('**/src/pages/PostCreatePage.tsx*', async (route) => {
        await gate;
        await route.continue();
      });
    try {
      await page
        .getByRole('link', { name: '+ 新規記事作成', exact: true })
        .click();
      await expect(page.getByRole('status')).toHaveText(
        '画面を読み込んでいます…'
      );
    } finally {
      release();
    }
    await expect(page.getByTestId('post-title-input')).toBeVisible();
    expect(editorRequests.length).toBeGreaterThan(0);
    await page.reload();
    await expect(page.getByTestId('post-title-input')).toBeVisible();
  });

  test('offers explicit reload when a page module fails and recovers after reload', async ({
    page,
    adminLoginPage,
  }) => {
    await adminLoginPage.navigate();
    await adminLoginPage.login('admin@example.com', 'testpassword');
    await page
      .context()
      .route('**/src/pages/PostCreatePage.tsx*', (route) => route.abort());
    await page
      .getByRole('link', { name: '+ 新規記事作成', exact: true })
      .click();
    await expect(page.getByRole('alert')).toContainText(
      '画面を表示できませんでした'
    );
    await page.context().unroute('**/src/pages/PostCreatePage.tsx*');
    await page.getByRole('button', { name: '再読み込み', exact: true }).click();
    await expect(page.getByTestId('post-title-input')).toBeVisible();
  });
});
