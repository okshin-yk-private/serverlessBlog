import { test, expect } from '../fixtures';
import { resetMockPosts } from '../mocks/mockData';

/**
 * Admin Publish Flow E2E Tests (WX PR5b)
 *
 * Verifies the BuildStatusBadge surfaces CodeBuild progress after publish.
 * The MSW build-status handler (frontend/admin/src/test/mocks/handlers.ts)
 * is wired to return "in-progress" on the first call and "succeeded"
 * thereafter, so the spec exercises the polling transition without a real
 * AWS round-trip.
 */

const E2E_TEST_PREFIX = '[E2E-TEST]';

test.describe('Admin Publish Flow - Build Status Badge', () => {
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

  test('shows build status badge progressing from in-progress to succeeded after publish', async ({
    adminDashboardPage,
    adminPostCreatePage,
    page,
  }) => {
    const testTitle = `${E2E_TEST_PREFIX} Publish Flow Article`;
    const testContent = '# Publish Flow Test\n\nWX PR5b badge verification.';

    await adminDashboardPage.navigate();
    await adminDashboardPage.clickNewPostButton();
    await page.waitForURL('**/posts/new', { timeout: 10000 });

    await adminPostCreatePage.fillTitle(testTitle);
    await adminPostCreatePage.fillContent(testContent);
    await page
      .locator(
        '[data-testid="post-category-select"] option[value="technology"]'
      )
      .waitFor({ state: 'attached', timeout: 10000 });
    await adminPostCreatePage.selectCategory('technology');
    await adminPostCreatePage.setPublishStatus('published');
    await adminPostCreatePage.clickSaveButton();

    await page.waitForURL(/\/posts(\?.*)?$/, { timeout: 10000 });
    const badge = page.getByTestId('build-status-badge');

    // First poll returns 'in-progress' — badge appears with that data attr.
    await expect(badge).toBeVisible({ timeout: 10000 });
    await expect(badge).toHaveAttribute('data-status', 'in-progress');
    await expect(badge).toContainText('ビルド中');

    // After the next poll cycle the MSW handler returns 'succeeded' and the
    // badge transitions, exposing a "公開サイトを開く" link is publicUrl is
    // wired (in this PR the page does not pass publicUrl, so we only assert
    // the status flip).
    await expect(badge).toHaveAttribute('data-status', 'succeeded', {
      timeout: 15000,
    });
    await expect(badge).toContainText('ビルド完了');
  });

  test('does not show the build status badge for draft saves', async ({
    adminDashboardPage,
    adminPostCreatePage,
    page,
  }) => {
    const draftTitle = `${E2E_TEST_PREFIX} Draft Without Badge`;

    await adminDashboardPage.navigate();
    await adminDashboardPage.clickNewPostButton();
    await page.waitForURL('**/posts/new', { timeout: 10000 });

    await adminPostCreatePage.fillTitle(draftTitle);
    await adminPostCreatePage.fillContent('Draft content');
    await page
      .locator(
        '[data-testid="post-category-select"] option[value="technology"]'
      )
      .waitFor({ state: 'attached', timeout: 10000 });
    await adminPostCreatePage.selectCategory('technology');
    await adminPostCreatePage.setPublishStatus('draft');
    await adminPostCreatePage.clickSaveButton();

    // 下書きも一覧へ遷移するが、サイトビルド要求は作らない。
    await page.waitForURL(/\/posts(\?.*)?$/, { timeout: 10000 });
    await expect(page.getByTestId('build-status-badge')).toHaveCount(0);
  });
});
