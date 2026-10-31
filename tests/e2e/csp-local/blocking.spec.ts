import { test, expect } from '@playwright/test';

// A positive control: prove the server/browser enforce CSP, rather than just
// passing the application smoke tests without a working violation detector.
test('the exact strict policy blocks an injected inline script', async ({
  page,
}) => {
  await page.goto('/articles/');
  const violation = page.waitForEvent('console', {
    predicate: (message) =>
      /Executing inline script violates/.test(message.text()),
  });
  await page.evaluate(() => {
    const script = document.createElement('script');
    script.textContent =
      'document.documentElement.dataset.cspProbe = "executed"';
    document.head.appendChild(script);
  });
  await violation;
  await expect(page.locator('html')).not.toHaveAttribute(
    'data-csp-probe',
    'executed'
  );
});
