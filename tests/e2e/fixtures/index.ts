import { test as base } from '@playwright/test';
import { HomePage } from '../pages/HomePage';
import { ArticlePage } from '../pages/ArticlePage';
import { AdminLoginPage } from '../pages/AdminLoginPage';
import { AdminDashboardPage } from '../pages/AdminDashboardPage';
import { AdminPostCreatePage } from '../pages/AdminPostCreatePage';
import { AdminPostEditPage } from '../pages/AdminPostEditPage';
import { ArticleEditorPage } from '../pages/ArticleEditorPage';
import { clearAllStorage } from '../utils/testHelpers';
import { resetMockPosts } from '../mocks/mockData';

/**
 * カスタムフィクスチャ型定義
 * すべてのE2Eテストで使用するページオブジェクトを提供
 */
type CustomFixtures = {
  homePage: HomePage;
  articlePage: ArticlePage;
  adminLoginPage: AdminLoginPage;
  adminDashboardPage: AdminDashboardPage;
  adminPostCreatePage: AdminPostCreatePage;
  adminPostEditPage: AdminPostEditPage;
  articleEditorPage: ArticleEditorPage;
};

/**
 * カスタムフィクスチャ定義
 * ページオブジェクトパターンを使用したテストを簡潔に記述可能にする
 *
 * Requirements:
 * - R44: テストデータ管理
 */
export const test = base.extend<CustomFixtures>({
  /**
   * ホームページフィクスチャ
   */
  homePage: async ({ page }, use) => {
    // モックデータをリセット（各テストで一貫した状態を保証）
    resetMockPosts();
    const homePage = new HomePage(page);
    await use(homePage);
  },

  /**
   * 記事詳細ページフィクスチャ
   */
  articlePage: async ({ page }, use) => {
    const articlePage = new ArticlePage(page);
    await use(articlePage);
  },

  /**
   * 管理画面ログインページフィクスチャ
   */
  adminLoginPage: async ({ page }, use) => {
    const adminLoginPage = new AdminLoginPage(page);
    await use(adminLoginPage);
  },

  /**
   * 管理画面ダッシュボードフィクスチャ
   */
  adminDashboardPage: async ({ page }, use) => {
    const adminDashboardPage = new AdminDashboardPage(page);
    await use(adminDashboardPage);
  },

  /**
   * 管理画面記事作成ページフィクスチャ
   */
  adminPostCreatePage: async ({ page }, use) => {
    const adminPostCreatePage = new AdminPostCreatePage(page);
    await use(adminPostCreatePage);
  },

  /**
   * 管理画面記事編集ページフィクスチャ
   */
  adminPostEditPage: async ({ page }, use) => {
    const adminPostEditPage = new AdminPostEditPage(page);
    await use(adminPostEditPage);
  },

  /**
   * 記事編集ページフィクスチャ
   */
  articleEditorPage: async ({ page }, use) => {
    const articleEditorPage = new ArticleEditorPage(page);
    await use(articleEditorPage);
  },
});

/**
 * 認証済みテスト用フィクスチャ
 * 管理画面のテストで事前にログインした状態を提供
 *
 * Note: このフィクスチャは非推奨です。
 * 代わりにbeforeEachでログイン処理を行うパターンを使用してください。
 * 例: admin-auth.spec.ts参照
 */

/**
 * ページクリーンアップ用フィクスチャ
 * 各テスト前後にストレージとCookieをクリア
 */
export const cleanTest = test.extend({
  page: async ({ page }, use) => {
    // テスト開始前にストレージをクリア
    await page.goto('/');
    await clearAllStorage(page);

    await use(page);

    // テスト終了後にストレージをクリア
    await clearAllStorage(page);
  },
});

export { expect } from '@playwright/test';
