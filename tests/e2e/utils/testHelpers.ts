import { Page } from '@playwright/test';

/**
 * E2Eテスト用ヘルパー関数
 * テスト全体で共通して使用するユーティリティ機能を提供
 *
 * Requirements:
 * - R44: テストデータ管理
 */

/**
 * ランダムな文字列を生成
 */
export function generateRandomString(length: number = 10): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * ランダムなメールアドレスを生成
 */
export function generateRandomEmail(): string {
  return `test-${generateRandomString(8)}@example.com`;
}

/**
 * タイムスタンプ付きの一意な文字列を生成
 */
export function generateUniqueString(prefix: string = 'test'): string {
  return `${prefix}-${Date.now()}-${generateRandomString(5)}`;
}

/**
 * テスト用記事データを生成
 */
export interface TestArticle {
  title: string;
  content: string;
  category: string;
  status: 'published' | 'draft';
}

export function generateTestArticle(status: 'published' | 'draft' = 'published'): TestArticle {
  return {
    title: generateUniqueString('Test Article'),
    content: `This is test content generated at ${new Date().toISOString()}. ${generateRandomString(100)}`,
    category: 'Technology',
    status,
  };
}

/**
 * 指定された時間待機
 */
export async function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 要素が表示されるまで待機（カスタムタイムアウト付き）
 */
export async function waitForElementWithRetry(
  page: Page,
  selector: string,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await page.locator(selector).waitFor({ state: 'visible', timeout: delayMs });
      return true;
    } catch {
      if (i === maxRetries - 1) return false;
      await wait(delayMs);
    }
  }
  return false;
}

/**
 * ページロード時間を測定
 */
export async function measureLoadTime(page: Page, url: string): Promise<number> {
  const startTime = Date.now();
  await page.goto(url);
  await page.waitForLoadState('networkidle');
  return Date.now() - startTime;
}

/**
 * スクリーンショットを撮影（失敗時のデバッグ用）
 */
export async function takeDebugScreenshot(
  page: Page,
  testName: string,
  stepName: string = 'debug'
): Promise<void> {
  const timestamp = Date.now();
  const filename = `${testName}-${stepName}-${timestamp}.png`;
  await page.screenshot({ path: `test-results/screenshots/${filename}`, fullPage: true });
}

/**
 * ローカルストレージに値を設定
 */
export async function setLocalStorage(
  page: Page,
  key: string,
  value: string
): Promise<void> {
  await page.evaluate(
    ({ key, value }) => localStorage.setItem(key, value),
    { key, value }
  );
}

/**
 * ローカルストレージから値を取得
 */
export async function getLocalStorage(page: Page, key: string): Promise<string | null> {
  return await page.evaluate(
    (key) => localStorage.getItem(key),
    key
  );
}

/**
 * セッションストレージに値を設定
 */
export async function setSessionStorage(
  page: Page,
  key: string,
  value: string
): Promise<void> {
  await page.evaluate(
    ({ key, value }) => sessionStorage.setItem(key, value),
    { key, value }
  );
}

/**
 * Cookieを設定
 */
export async function setCookie(
  page: Page,
  name: string,
  value: string,
  domain?: string
): Promise<void> {
  await page.context().addCookies([
    {
      name,
      value,
      domain: domain || new URL(page.url()).hostname,
      path: '/',
    },
  ]);
}

/**
 * すべてのストレージとCookieをクリア
 */
export async function clearAllStorage(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.context().clearCookies();
}

/**
 * ネットワークリクエストをモック
 */
export async function mockApiResponse(
  page: Page,
  urlPattern: string | RegExp,
  response: any,
  status: number = 200
): Promise<void> {
  await page.route(urlPattern, async (route) => {
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(response),
    });
  });
}

/**
 * API呼び出しを待機
 */
export async function waitForApiCall(
  page: Page,
  urlPattern: string | RegExp
): Promise<void> {
  await page.waitForResponse(
    (response) => {
      const url = response.url();
      if (typeof urlPattern === 'string') {
        return url.includes(urlPattern);
      }
      return urlPattern.test(url);
    },
    { timeout: 10000 }
  );
}

/**
 * ブラウザコンソールエラーをキャプチャ
 */
export function captureConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });
  return errors;
}

/**
 * 認証トークンを設定（テスト用）
 */
export async function setAuthToken(page: Page, token: string): Promise<void> {
  await setLocalStorage(page, 'authToken', token);
  // または認証方式に応じてCookieに設定
  // await setCookie(page, 'authToken', token);
}

/**
 * ビューポートサイズを変更
 */
export async function setViewportSize(
  page: Page,
  width: number,
  height: number
): Promise<void> {
  await page.setViewportSize({ width, height });
}

/**
 * モバイルビューポートに変更
 */
export async function setMobileViewport(page: Page): Promise<void> {
  await setViewportSize(page, 375, 667); // iPhone SE サイズ
}

/**
 * タブレットビューポートに変更
 */
export async function setTabletViewport(page: Page): Promise<void> {
  await setViewportSize(page, 768, 1024); // iPad サイズ
}

/**
 * デスクトップビューポートに変更
 */
export async function setDesktopViewport(page: Page): Promise<void> {
  await setViewportSize(page, 1920, 1080); // Full HD サイズ
}
