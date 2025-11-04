import { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * ホームページオブジェクト
 * 公開サイトのトップページの操作を提供
 *
 * Requirements:
 * - R43: E2Eテスト（記事一覧表示、カテゴリフィルタリング）
 */
export class HomePage extends BasePage {
  // ページ要素のセレクター
  private readonly selectors = {
    articleList: '[data-testid="article-list"]',
    articleCard: '[data-testid="article-card"]',
    articleTitle: '[data-testid="article-title"]',
    articleExcerpt: '[data-testid="article-excerpt"]',
    articleCategory: '[data-testid="article-category"]',
    categoryFilter: '[data-testid="category-filter"]',
    categoryOption: '[data-testid="category-option"]',
    searchInput: '[data-testid="search-input"]',
    searchButton: '[data-testid="search-button"]',
    loadMoreButton: '[data-testid="load-more"]',
    noArticlesMessage: '[data-testid="no-articles"]',
  };

  constructor(page: Page) {
    super(page);
  }

  /**
   * ホームページに移動
   */
  async navigate(): Promise<void> {
    await this.goto('/');
    await this.waitForPageLoad();
  }

  /**
   * 記事一覧が表示されているか確認
   */
  async isArticleListVisible(): Promise<boolean> {
    return await this.isElementVisible(this.selectors.articleList);
  }

  /**
   * 記事カードを取得
   */
  getArticleCards(): Locator {
    return this.page.locator(this.selectors.articleCard);
  }

  /**
   * 記事数を取得
   */
  async getArticleCount(): Promise<number> {
    return await this.getArticleCards().count();
  }

  /**
   * 指定されたインデックスの記事タイトルを取得
   */
  async getArticleTitle(index: number): Promise<string> {
    const article = this.getArticleCards().nth(index);
    return await article.locator(this.selectors.articleTitle).textContent() || '';
  }

  /**
   * 指定されたインデックスの記事をクリック
   */
  async clickArticle(index: number): Promise<void> {
    const article = this.getArticleCards().nth(index);
    await article.click();
    await this.waitForPageLoad();
  }

  /**
   * タイトルで記事を検索してクリック
   */
  async clickArticleByTitle(title: string): Promise<void> {
    const article = this.page.locator(this.selectors.articleCard, {
      has: this.page.locator(this.selectors.articleTitle, { hasText: title })
    });
    await article.click();
    await this.waitForPageLoad();
  }

  /**
   * カテゴリフィルターを選択
   */
  async selectCategory(category: string): Promise<void> {
    await this.page.selectOption(this.selectors.categoryFilter, { label: category });
    await this.waitForPageLoad();
  }

  /**
   * 検索を実行
   */
  async search(query: string): Promise<void> {
    await this.fill(this.selectors.searchInput, query);
    await this.click(this.selectors.searchButton);
    await this.waitForPageLoad();
  }

  /**
   * 「もっと読み込む」ボタンをクリック
   */
  async clickLoadMore(): Promise<void> {
    await this.click(this.selectors.loadMoreButton);
    await this.waitForPageLoad();
  }

  /**
   * 「もっと読み込む」ボタンが表示されているか確認
   */
  async isLoadMoreVisible(): Promise<boolean> {
    return await this.isElementVisible(this.selectors.loadMoreButton);
  }

  /**
   * 記事が表示されていないメッセージが表示されているか確認
   */
  async isNoArticlesMessageVisible(): Promise<boolean> {
    return await this.isElementVisible(this.selectors.noArticlesMessage);
  }

  /**
   * 指定されたカテゴリの記事のみが表示されているか確認
   */
  async areAllArticlesInCategory(category: string): Promise<boolean> {
    const categoryElements = this.page.locator(this.selectors.articleCategory);
    const count = await categoryElements.count();

    for (let i = 0; i < count; i++) {
      const categoryText = await categoryElements.nth(i).textContent();
      if (categoryText !== category) {
        return false;
      }
    }

    return count > 0;
  }

  /**
   * ページのロード時間を測定
   */
  async measurePageLoadTime(): Promise<number> {
    const startTime = Date.now();
    await this.navigate();
    await this.waitForElement(this.selectors.articleList);
    const endTime = Date.now();
    return endTime - startTime;
  }
}
