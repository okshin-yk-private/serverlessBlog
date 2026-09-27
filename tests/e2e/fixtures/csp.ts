import type { Page } from '@playwright/test';
import { test as base, expect } from './index';

/**
 * CSP Report-Only 違反ガード
 *
 * Issue #680 フェーズ1: CDN の CSP は `Content-Security-Policy-Report-Only`
 * として配信され、違反はブラウザのコンソールに記録されるのみでブロックはしない。
 * DEV 実環境 (VITE_ENABLE_MSW_MOCK=false) でこのフィクスチャを使う spec を
 * 実行し、違反が 0 件であることを継続的に確認する。
 *
 * - ローカルの MSW 実行（CloudFront を経由しないため CSP ヘッダー自体が
 *   付かない）では違反が発生しようがないため、このフィクスチャは自動的に
 *   trivially pass する。
 * - `securitypolicyviolation` DOM イベントと、ブラウザがコンソールに出す
 *   "Content-Security-Policy(-Report-Only)" を含むメッセージの両方を監視する
 *   （ブラウザ実装によって通知経路が異なるため両方を見る）。
 */

export interface CspViolation {
  source: 'console' | 'securitypolicyviolation-event';
  message: string;
}

declare global {
  interface Window {
    __reportCspViolation?: (detail: string) => void;
  }
}

async function attachCspViolationListener(
  page: Page,
  violations: CspViolation[]
): Promise<void> {
  page.on('console', (msg) => {
    const text = msg.text();
    if (/content-security-policy(-report-only)?/i.test(text)) {
      violations.push({ source: 'console', message: text });
    }
  });

  await page.exposeFunction('__reportCspViolation', (detail: string) => {
    violations.push({
      source: 'securitypolicyviolation-event',
      message: detail,
    });
  });

  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      const detail = JSON.stringify({
        violatedDirective: event.violatedDirective,
        blockedURI: event.blockedURI,
        disposition: event.disposition,
        documentURI: event.documentURI,
      });
      window.__reportCspViolation?.(detail);
    });
  });
}

type CspFixtures = {
  /** Auto-use: fails the test if any CSP (Report-Only) violation was observed. */
  cspGuard: void;
};

export const test = base.extend<CspFixtures>({
  cspGuard: [
    async ({ page }, use) => {
      const violations: CspViolation[] = [];
      await attachCspViolationListener(page, violations);

      await use();

      expect(
        violations,
        `CSP violation(s) detected (Content-Security-Policy-Report-Only, ` +
          `Issue #680 phase 1):\n${violations
            .map((v) => `- [${v.source}] ${v.message}`)
            .join('\n')}`
      ).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
