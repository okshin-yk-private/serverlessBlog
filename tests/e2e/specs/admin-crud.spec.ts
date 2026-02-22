import { test, expect } from '../fixtures';
import { resetMockPosts } from '../mocks/mockData';

/**
 * Admin CRUD Integration E2E Tests
 *
 * MSW mock environment and real AWS environment tests.
 * Uses existing Page Objects: AdminDashboardPage, AdminPostCreatePage, AdminPostEditPage.
 *
 * Test data uses [E2E-TEST] prefix for automated cleanup in real environments.
 */

// Test data prefix for identification and cleanup
const E2E_TEST_PREFIX = '[E2E-TEST]';

test.describe('Admin CRUD - Article Management', () => {
  // Test credentials
  const testCredentials = {
    email: process.env.TEST_ADMIN_EMAIL || 'admin@example.com',
    password: process.env.TEST_ADMIN_PASSWORD || 'testpassword',
  };

  test.beforeEach(async ({ adminLoginPage }) => {
    // Reset mock data for consistent state
    resetMockPosts();

    // Login before each test
    await adminLoginPage.navigate();
    await adminLoginPage.clearCredentials();
    await adminLoginPage.login(testCredentials.email, testCredentials.password);
  });

  test('should create a new article and display it on dashboard', async ({
    adminDashboardPage,
    adminPostCreatePage,
    page,
  }) => {
    const testTitle = `${E2E_TEST_PREFIX} New Test Article`;
    const testContent =
      '# Test Content\n\nThis is a test article created by E2E test.';

    // Navigate to dashboard and click new article button
    await adminDashboardPage.navigate();
    const initialCount = await adminDashboardPage.getArticleCount();

    await adminDashboardPage.clickNewPostButton();

    // Wait for create page to load
    await page.waitForURL('**/posts/new', { timeout: 10000 });

    // Fill in article form (category is required for form submission)
    await adminPostCreatePage.fillTitle(testTitle);
    await adminPostCreatePage.fillContent(testContent);

    // Wait for categories to load from MSW before selecting
    await page
      .locator('[data-testid="post-category-select"] option[value="technology"]')
      .waitFor({ state: 'attached', timeout: 10000 });
    await adminPostCreatePage.selectCategory('technology');
    await adminPostCreatePage.setPublishStatus('published');
    await adminPostCreatePage.clickSaveButton();

    // After saving, the app redirects to /posts via React Router (SPA navigation).
    // Do NOT use adminDashboardPage.navigate() here - page.goto() causes a full
    // page reload which re-initializes the MSW module and resets mockPosts state.
    await page.waitForURL('**/posts', { timeout: 10000 });
    await adminDashboardPage.waitForArticleListLoaded();

    // Verify the article appears in the list
    const newCount = await adminDashboardPage.getArticleCount();
    expect(newCount).toBeGreaterThan(initialCount);

    const isVisible = await adminDashboardPage.isArticleVisible(testTitle);
    expect(isVisible).toBeTruthy();
  });

  test('should edit an existing article and reflect changes', async ({
    adminDashboardPage,
    adminPostEditPage,
    page,
  }) => {
    // Navigate to dashboard
    await adminDashboardPage.navigate();
    await adminDashboardPage.waitForArticleListLoaded();

    // Get the title of the first article for editing
    const originalTitle = await adminDashboardPage.getArticleTitle(0);
    const updatedTitle = `${E2E_TEST_PREFIX} Updated: ${originalTitle}`;

    // Click edit button for the first article
    await adminDashboardPage.clickEditArticle(0);

    // Wait for edit page to load
    await page.waitForURL('**/posts/edit/**', { timeout: 10000 });

    // Update the title
    await adminPostEditPage.fillTitle(updatedTitle);
    await adminPostEditPage.clickSaveButton();

    // After saving, the app redirects to /posts via React Router (SPA navigation).
    // Do NOT use adminDashboardPage.navigate() here - page.goto() causes a full
    // page reload which re-initializes the MSW module and resets mockPosts state.
    await page.waitForURL('**/posts', { timeout: 10000 });
    await adminDashboardPage.waitForArticleListLoaded();

    const isUpdatedVisible =
      await adminDashboardPage.isArticleVisible(updatedTitle);
    expect(isUpdatedVisible).toBeTruthy();
  });

  test('should delete an article and remove it from the list', async ({
    adminDashboardPage,
  }) => {
    // Navigate to dashboard
    await adminDashboardPage.navigate();
    await adminDashboardPage.waitForArticleListLoaded();

    // Get initial article count and the title of the article to delete
    const initialCount = await adminDashboardPage.getArticleCount();
    expect(initialCount).toBeGreaterThan(0);

    const titleToDelete = await adminDashboardPage.getArticleTitle(0);

    // Click delete button for the first article
    await adminDashboardPage.clickDeleteArticle(0);

    // Verify confirm dialog appears
    const isDialogVisible =
      await adminDashboardPage.isDeleteConfirmDialogVisible();
    expect(isDialogVisible).toBeTruthy();

    // Confirm deletion
    await adminDashboardPage.confirmDelete();

    // Wait for the list to update
    await adminDashboardPage.waitForArticleListLoaded();

    // Verify article count decreased
    const newCount = await adminDashboardPage.getArticleCount();
    expect(newCount).toBeLessThan(initialCount);

    // Verify the deleted article is no longer visible
    const isStillVisible =
      await adminDashboardPage.isArticleVisible(titleToDelete);
    expect(isStillVisible).toBeFalsy();
  });
});
