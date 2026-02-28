import { test, expect } from '../fixtures';

/**
 * AI Agent用リファレンステスト（seed.spec.ts）
 *
 * このファイルはPlaywright AI Agents（Generator / Healer）が
 * テスト生成・修復時に参照するリファレンスです。
 * プロジェクト固有の規約・パターンを模範的に示します：
 *
 * 規約:
 * - import { test, expect } from '../fixtures' を使用（@playwright/testではない）
 * - Page Objectパターン（BasePage継承）を活用
 * - beforeEach でのnavigateパターン
 * - Arrange-Act-Assert (AAA) 構造
 * - 日本語コメント
 * - MSWモック環境（VITE_ENABLE_MSW_MOCK=true）での動作前提
 *
 * Requirements:
 * - R43: UI E2Eテスト（最小限）
 */

test.describe('Seed - ホームページ基本フロー', () => {
  test.beforeEach(async ({ homePage }) => {
    // Arrange: ホームページに移動
    await homePage.navigate();
  });

  test('記事一覧が表示され、記事数が1件以上であること', async ({
    homePage,
  }) => {
    // Assert: 記事一覧の表示を確認
    const isVisible = await homePage.isArticleListVisible();
    expect(isVisible).toBeTruthy();

    // Assert: 記事が1件以上存在することを確認
    const articleCount = await homePage.getArticleCount();
    expect(articleCount).toBeGreaterThan(0);
  });

  test('最初の記事のタイトルが取得できること', async ({ homePage }) => {
    // Act: 最初の記事のタイトルを取得
    const title = await homePage.getArticleTitle(0);

    // Assert: タイトルが空でないことを確認
    expect(title).toBeTruthy();
    expect(title.length).toBeGreaterThan(0);
  });

  test('記事をクリックすると詳細ページに遷移すること', async ({
    homePage,
    page,
  }) => {
    // Act: 最初の記事をクリック
    await homePage.clickArticle(0);

    // Assert: 記事詳細ページのURLに遷移することを確認
    await page.waitForURL('**/posts/**', { timeout: 10000 });
    expect(page.url()).toContain('/posts/');
  });
});

test.describe('Seed - 記事詳細ページ基本フロー', () => {
  // テスト用の記事ID（MSWモックデータ）
  const testArticleId = 'post-1';

  test('記事詳細ページでタイトルと内容が表示されること', async ({
    articlePage,
  }) => {
    // Arrange & Act: 記事詳細ページに移動
    await articlePage.navigate(testArticleId);

    // Assert: タイトルが表示されることを確認
    const title = await articlePage.getTitle();
    expect(title).toBeTruthy();
    expect(title.length).toBeGreaterThan(0);

    // Assert: 内容が表示されることを確認
    const content = await articlePage.getContent();
    expect(content).toBeTruthy();
    expect(content.length).toBeGreaterThan(0);
  });
});
