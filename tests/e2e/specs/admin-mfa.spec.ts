import { test, expect } from '@playwright/test';

test.describe('TOTP sign-in (MSW)', () => {
  test.skip(
    process.env.VITE_ENABLE_MSW_MOCK === 'false',
    'Mock-only MFA fixtures'
  );
  async function login(page: import('@playwright/test').Page, email: string) {
    await page.goto('/login');
    await page.getByTestId('email-input').fill(email);
    await page.getByTestId('password-input').fill('testpassword');
    await page.getByTestId('login-button').click();
  }
  test('rejects an invalid code and retries before entering the dashboard', async ({
    page,
  }) => {
    await login(page, 'totp@example.com');
    await expect(
      page.getByRole('heading', { name: '二要素認証' })
    ).toBeVisible();
    expect(
      await page.evaluate(() => sessionStorage.getItem('auth_session_token'))
    ).toBeNull();
    await page.getByLabel('認証コード').fill('000000');
    await page.getByRole('button', { name: '認証する', exact: true }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel('認証コード').fill('123456');
    await page.getByRole('button', { name: '認証する', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });
  test('renders a local setup QR and completes enrollment', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, 'totp-setup@example.com');
    await expect(
      page.getByRole('heading', { name: '認証アプリを登録' })
    ).toBeVisible();
    await expect(
      page.getByAltText('認証アプリ登録用 QR コード')
    ).toHaveAttribute('src', /^data:image\/png;base64,/);
    await expect(page.getByTestId('totp-secret')).toHaveText(
      'JBSWY3DPEHPK3PXP'
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true);
    await page.getByLabel('認証コード').fill('123456');
    await page.getByRole('button', { name: '認証する', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });
  test('cancels setup without retaining its secret', async ({ page }) => {
    await login(page, 'totp-setup@example.com');
    await expect(page.getByTestId('totp-secret')).toBeVisible();
    await page.getByRole('button', { name: 'ログインからやり直す' }).click();
    await expect(page.getByTestId('totp-secret')).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: '管理画面ログイン' })
    ).toBeVisible();
  });
  test('continues from a new password to TOTP before navigating', async ({
    page,
  }) => {
    await login(page, 'new-password-totp@example.com');
    await page.locator('#newPassword').fill('NewPassword1!');
    await page.locator('#confirmPassword').fill('NewPassword1!');
    await page.locator('button[type="submit"]').click();
    await expect(
      page.getByRole('heading', { name: '二要素認証' })
    ).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel('認証コード').fill('123456');
    await page.getByRole('button', { name: '認証する', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});
