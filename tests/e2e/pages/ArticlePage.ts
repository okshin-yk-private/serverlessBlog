import { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * 記事詳細ページオブジェクト
 * 公開サイトの記事詳細ページの操作を提供
 *
 * Requirements:
 * - R43: E2Eテスト（記事詳細表示）
 */
export class ArticlePage extends BasePage {
  // ページ要素のセレクター
  private readonly selectors = {
    articleTitle: '[data-testid="article-title"]',
    articleContent: '[data-testid="article-content"]',
    articleMeta: '[data-testid="article-meta"]',
    articleAuthor: '[data-testid="article-author"]',
    articleDate: '[data-testid="article-date"]',
    articleCategory: '[data-testid="article-category"]',
    articleImage: '[data-testid="article-image"]',
    backButton: '[data-testid="back-button"]',
    relatedArticles: '[data-testid="related-articles"]',
    relatedArticleCard: '[data-testid="related-article-card"]',
  };

  constructor(page: Page) {
    super(page);
  }

  /**
   * ページロードを待つ（記事ページ用にオーバーライド）
   * SEOメタタグが正しく設定されるまで待機
   */
  async waitForPageLoad(): Promise<void> {
    await super.waitForPageLoad();
    
    // 記事ページでは og:type が 'article' になるまで待つ
    // これにより、React の useEffect が完了するのを保証
    await this.page.waitForFunction(() => {
      const ogType = document.querySelector('meta[property="og:type"]');
      return ogType && ogType.getAttribute('content') === 'article';
    }, { timeout: 5000 });
  }

  /**
   * 記事詳細ページに移動
   */
  async navigate(articleId: string): Promise<void> {
    await this.goto(`/posts/${articleId}`);
    await this.waitForPageLoad();
  }

  /**
   * 記事タイトルを取得
   */
  async getTitle(): Promise<string> {
    return await this.page.locator(this.selectors.articleTitle).textContent() || '';
  }

  /**
   * 記事内容を取得
   */
  async getContent(): Promise<string> {
    return await this.page.locator(this.selectors.articleContent).textContent() || '';
  }

  /**
   * 記事著者を取得
   */
  async getAuthor(): Promise<string> {
    return await this.page.locator(this.selectors.articleAuthor).textContent() || '';
  }

  /**
   * 記事公開日を取得
   */
  async getDate(): Promise<string> {
    return await this.page.locator(this.selectors.articleDate).textContent() || '';
  }

  /**
   * 記事カテゴリを取得
   */
  async getCategory(): Promise<string> {
    return await this.page.locator(this.selectors.articleCategory).textContent() || '';
  }

  /**
   * 記事画像が表示されているか確認
   */
  async isImageVisible(): Promise<boolean> {
    return await this.isElementVisible(this.selectors.articleImage);
  }

  /**
   * 記事画像のURLを取得
   */
  async getImageUrl(): Promise<string> {
    const image = this.page.locator(this.selectors.articleImage);
    return await image.getAttribute('src') || '';
  }

  /**
   * 戻るボタンをクリック
   */
  async clickBackButton(): Promise<void> {
    await this.click(this.selectors.backButton);
    await this.waitForPageLoad();
  }

  /**
   * 関連記事が表示されているか確認
   */
  async areRelatedArticlesVisible(): Promise<boolean> {
    return await this.isElementVisible(this.selectors.relatedArticles);
  }

  /**
   * 関連記事数を取得
   */
  async getRelatedArticlesCount(): Promise<number> {
    return await this.page.locator(this.selectors.relatedArticleCard).count();
  }

  /**
   * 指定されたインデックスの関連記事をクリック
   */
  async clickRelatedArticle(index: number): Promise<void> {
    const article = this.page.locator(this.selectors.relatedArticleCard).nth(index);
    await article.click();
    await this.waitForPageLoad();
  }

  /**
   * 記事内容に指定されたテキストが含まれているか確認
   */
  async containsText(text: string): Promise<boolean> {
    const content = await this.getContent();
    return content.includes(text);
  }

  /**
   * 記事のメタ情報が完全に表示されているか確認
   */
  async hasCompleteMetadata(): Promise<boolean> {
    const author = await this.getAuthor();
    const date = await this.getDate();
    const category = await this.getCategory();

    return !!(author && date && category);
  }

  /**
   * ページのロード時間を測定
   */
  async measurePageLoadTime(articleId: string): Promise<number> {
    const startTime = Date.now();
    await this.navigate(articleId);
    await this.waitForElement(this.selectors.articleContent);
    const endTime = Date.now();
    return endTime - startTime;
  }
}
