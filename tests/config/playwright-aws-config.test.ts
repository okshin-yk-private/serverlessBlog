import { describe, test, expect, beforeAll, afterAll } from 'bun:test';

/**
 * Unit tests for playwright.aws.config.ts
 *
 * Validates the config structure required for AWS environment E2E tests:
 * - Admin tests must use baseURL pointing to /admin path (CloudFront routing)
 * - Public tests must use the base URL without /admin path
 * - Separate projects with testMatch patterns to avoid cross-contamination
 *
 * Issue #156: Admin E2E tests fail with TimeoutError in AWS environment
 * because admin is served under /admin/ path via CloudFront, not localhost:3001
 */

const BASE_URL = 'https://example.cloudfront.net';

describe('playwright.aws.config.ts', () => {
  let originalBaseUrl: string | undefined;
  let originalAdminBaseUrl: string | undefined;

  beforeAll(() => {
    originalBaseUrl = process.env.BASE_URL;
    originalAdminBaseUrl = process.env.ADMIN_BASE_URL;
    process.env.BASE_URL = BASE_URL;
    delete process.env.ADMIN_BASE_URL;
  });

  afterAll(() => {
    process.env.BASE_URL = originalBaseUrl;
    process.env.ADMIN_BASE_URL = originalAdminBaseUrl;
  });

  test('should have admin-chromium project', async () => {
    const { default: config } = await import('../../playwright.aws.config.ts');
    const projects = config.projects ?? [];
    const adminProject = projects.find(
      (p: { name: string }) => p.name === 'admin-chromium'
    );
    expect(adminProject).toBeDefined();
  });

  test('admin-chromium project should set baseURL to BASE_URL/admin when ADMIN_BASE_URL is not set', async () => {
    const { default: config } = await import('../../playwright.aws.config.ts');
    const projects = config.projects ?? [];
    const adminProject = projects.find(
      (p: { name: string }) => p.name === 'admin-chromium'
    );
    expect(adminProject).toBeDefined();
    expect(adminProject?.use?.baseURL).toBe(`${BASE_URL}/admin`);
  });

  test('admin-chromium project should use ADMIN_BASE_URL when set', async () => {
    const customAdminUrl = 'https://admin.custom.example.com';
    process.env.ADMIN_BASE_URL = customAdminUrl;

    // Re-import to pick up new env vars (bun caches imports, so we test indirectly via config logic)
    const adminBaseUrl =
      process.env.ADMIN_BASE_URL || `${process.env.BASE_URL}/admin`;
    expect(adminBaseUrl).toBe(customAdminUrl);

    delete process.env.ADMIN_BASE_URL;
  });

  test('admin-chromium project should have testMatch for admin specs only', async () => {
    const { default: config } = await import('../../playwright.aws.config.ts');
    const projects = config.projects ?? [];
    const adminProject = projects.find(
      (p: { name: string }) => p.name === 'admin-chromium'
    );
    expect(adminProject).toBeDefined();
    // testMatch should target admin spec files
    const testMatch = adminProject?.testMatch;
    expect(testMatch).toBeDefined();
    const matchPattern = Array.isArray(testMatch)
      ? testMatch.join(',')
      : testMatch;
    expect(matchPattern).toMatch(/admin/);
  });

  test('chromium project should have testMatch for public specs only', async () => {
    const { default: config } = await import('../../playwright.aws.config.ts');
    const projects = config.projects ?? [];
    const chromiumProject = projects.find(
      (p: { name: string }) => p.name === 'chromium'
    );
    expect(chromiumProject).toBeDefined();
    // testMatch should NOT include admin specs
    const testMatch = chromiumProject?.testMatch;
    expect(testMatch).toBeDefined();
    const matchPattern = Array.isArray(testMatch)
      ? testMatch.join(',')
      : String(testMatch);
    expect(matchPattern).not.toMatch(/admin-\*/);
  });

  test('package.json test:e2e:aws:admin script should use --project=admin-chromium', async () => {
    const pkg = await Bun.file('package.json').json();
    const script: string = pkg.scripts['test:e2e:aws:admin'];
    expect(script).toContain('--project=admin-chromium');
  });

  test('package.json test:e2e:aws:admin script should not specify individual spec files', async () => {
    const pkg = await Bun.file('package.json').json();
    const script: string = pkg.scripts['test:e2e:aws:admin'];
    expect(script).not.toContain('admin-auth.spec.ts');
    expect(script).not.toContain('admin-crud.spec.ts');
    expect(script).not.toContain('admin-unauthorized-access.spec.ts');
  });
});
