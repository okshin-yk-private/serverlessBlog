/**
 * admin SPA への実ログイン (Amplify SRP → Cognito) で ID トークンを取得する。
 *
 * `global-teardown.ts` (自動掃除) と `cleanup-test-data.ts` (手動 CLI) の両方が
 * 同じ経路を使う。実環境に REST ログインは存在しない (#678 で auth Lambda ごと
 * 撤去、App Client は USER_PASSWORD_AUTH を許可しない) ため、実 UI でログインし
 * SPA が sessionStorage に置いた ID トークンを読む以外の手段はない。
 */

import { chromium, type FullConfig } from '@playwright/test';
import { AdminLoginPage } from '../pages/AdminLoginPage';

/** admin SPA が ID トークンを置く sessionStorage キー (frontend/admin/src/utils/auth.ts) */
export const ADMIN_SESSION_TOKEN_KEY = 'auth_session_token';

export interface ObtainIdTokenOptions {
  /** DEV の CloudFront Basic 認証 (未設定なら付与しない) */
  basicAuth?: { username: string; password: string };
}

/**
 * ID トークンを取得する。取得できなければ理由を warn ログに出して null を返す
 * (呼び出し側は skip などの判断に使う。credential を返り値以外でログに出さない)。
 * TOTP が必須のユーザー (prd の MFA ON 等) はここでダッシュボードに到達しない。
 */
export async function obtainIdToken(
  adminBaseURL: string,
  email: string,
  password: string,
  options: ObtainIdTokenOptions = {}
): Promise<string | null> {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      baseURL: adminBaseURL,
      // extraHTTPHeaders と違いオリジンを限定でき、Cognito へのリクエストに
      // Basic 認証情報を載せない。
      httpCredentials: options.basicAuth
        ? {
            username: options.basicAuth.username,
            password: options.basicAuth.password,
            origin: new URL(adminBaseURL).origin,
          }
        : undefined,
    });
    const page = await context.newPage();
    const loginPage = new AdminLoginPage(page);
    await loginPage.navigate();
    try {
      await loginPage.login(email, password);
    } catch {
      // clickLogin はダッシュボード到達・エラー表示のどちらも起きないと reject する
    }
    if (!new URL(page.url()).pathname.endsWith('/dashboard')) {
      console.warn(
        `⚠️  Admin login did not reach the dashboard (at ${new URL(page.url()).pathname}).` +
          ' Wrong credentials or an MFA (TOTP) challenge is likely.'
      );
      return null;
    }
    return await page.evaluate(
      (key) => sessionStorage.getItem(key),
      ADMIN_SESSION_TOKEN_KEY
    );
  } finally {
    await browser.close();
  }
}

/** DEV の CloudFront Basic 認証を環境変数から組み立てる。両方揃っていなければ undefined。 */
export function basicAuthFromEnv(
  env: NodeJS.ProcessEnv = process.env
): ObtainIdTokenOptions['basicAuth'] {
  const { DEV_BASIC_AUTH_USERNAME, DEV_BASIC_AUTH_PASSWORD } = env;
  if (!DEV_BASIC_AUTH_USERNAME || !DEV_BASIC_AUTH_PASSWORD) return undefined;
  return {
    username: DEV_BASIC_AUTH_USERNAME,
    password: DEV_BASIC_AUTH_PASSWORD,
  };
}

/**
 * admin SPA のベース URL。playwright.aws.config.ts の admin-chromium と同じ解決規則
 * (--project で絞った実行でも同じ値になるよう、見つからなければ env から組み立てる)。
 * Playwright の FullConfig を持たない CLI からは `config` を省略して呼ぶ。
 */
export function resolveAdminBaseURL(config?: FullConfig): string {
  const fromProject = config?.projects.find((p) => p.name === 'admin-chromium')
    ?.use.baseURL;
  const url =
    fromProject ||
    process.env.ADMIN_BASE_URL ||
    `${process.env.BASE_URL || 'http://localhost:5173'}/admin`;
  return url.replace(/\/*$/, '/');
}

/** admin SPA は VITE_API_URL=/api (同一オリジンの CloudFront /api/* behavior) 前提。 */
export function resolveApiBase(adminBaseURL: string): string {
  return new URL(
    process.env.VITE_API_BASE_URL || '/api',
    adminBaseURL
  ).href.replace(/\/+$/, '');
}
