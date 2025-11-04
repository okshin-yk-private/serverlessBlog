import { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * 管理画面ダッシュボードページオブジェクト
 * 管理画面のダッシュボード機能の操作を提供
 *
 * Requirements:
 * - R43: E2Eテスト（記事管理フロー）
 */
export class AdminDashboardPage extends BasePage {
  // ページ要素のセレクター
  private readonly selectors = {
    newArticleButton: '[data-testid="new-article-button"]',
    articleList: '[data-testid="admin-article-list"]',
    articleItem: '[data-testid="admin-article-item"]',
    articleTitle: '[data-testid="admin-article-title"]',
    articleStatus: '[data-testid="admin-article-status"]',
    editButton: '[data-testid="edit-article-button"]',
    deleteButton: '[data-testid="delete-article-button"]',
    publishButton: '[data-testid="publish-article-button"]',
    draftButton: '[data-testid="draft-article-button"]',
    logoutButton: '[data-testid="logout-button"]',
    searchInput: '[data-testid="admin-search-input"]',
    filterDropdown: '[data-testid="admin-filter-dropdown"]',
    confirmDialog: '[data-testid="confirm-dialog"]',
    confirmYes: '[data-testid="confirm-yes"]',
    confirmNo: '[data-testid="confirm-no"]',
  };

  constructor(page: Page) {
    super(page);
  }

  /**
   * ダッシュボードページに移動
   */
  async navigate(): Promise<void> {
    await this.goto('/dashboard');
    await this.waitForPageLoad();
  }

  /**
   * 新規記事作成ボタンをクリック
   */
  async clickNewArticle(): Promise<void> {
    await this.click(this.selectors.newArticleButton);
    await this.waitForPageLoad();
  }

  /**
   * 記事一覧が表示されているか確認
   */
  async isArticleListVisible(): Promise<boolean> {
    return await this.isElementVisible(this.selectors.articleList);
  }

  /**
   * 記事一覧を取得
   */
  getArticleItems(): Locator {
    return this.page.locator(this.selectors.articleItem);
  }

  /**
   * 記事数を取得
   */
  async getArticleCount(): Promise<number> {
    return await this.getArticleItems().count();
  }

  /**
   * 指定されたインデックスの記事タイトルを取得
   */
  async getArticleTitle(index: number): Promise<string> {
    const article = this.getArticleItems().nth(index);
    return await article.locator(this.selectors.articleTitle).textContent() || '';
  }

  /**
   * 指定されたインデックスの記事ステータスを取得
   */
  async getArticleStatus(index: number): Promise<string> {
    const article = this.getArticleItems().nth(index);
    return await article.locator(this.selectors.articleStatus).textContent() || '';
  }

  /**
   * タイトルで記事を検索
   */
  async searchArticle(title: string): Promise<void> {
    await this.fill(this.selectors.searchInput, title);
    await this.page.keyboard.press('Enter');
    await this.waitForPageLoad();
  }

  /**
   * 指定されたインデックスの記事を編集
   */
  async clickEditArticle(index: number): Promise<void> {
    const article = this.getArticleItems().nth(index);
    await article.locator(this.selectors.editButton).click();
    await this.waitForPageLoad();
  }

  /**
   * タイトルで記事を検索して編集
   */
  async editArticleByTitle(title: string): Promise<void> {
    const article = this.page.locator(this.selectors.articleItem, {
      has: this.page.locator(this.selectors.articleTitle, { hasText: title })
    });
    await article.locator(this.selectors.editButton).click();
    await this.waitForPageLoad();
  }

  /**
   * 指定されたインデックスの記事を削除
   */
  async clickDeleteArticle(index: number): Promise<void> {
    const article = this.getArticleItems().nth(index);
    await article.locator(this.selectors.deleteButton).click();
    await this.waitForElement(this.selectors.confirmDialog);
  }

  /**
   * 削除確認ダイアログで「はい」をクリック
   */
  async confirmDelete(): Promise<void> {
    await this.click(this.selectors.confirmYes);
    await this.waitForPageLoad();
  }

  /**
   * 削除確認ダイアログで「いいえ」をクリック
   */
  async cancelDelete(): Promise<void> {
    await this.click(this.selectors.confirmNo);
    await this.waitForElementHidden(this.selectors.confirmDialog);
  }

  /**
   * 指定されたインデックスの記事を公開
   */
  async publishArticle(index: number): Promise<void> {
    const article = this.getArticleItems().nth(index);
    await article.locator(this.selectors.publishButton).click();
    await this.waitForPageLoad();
  }

  /**
   * 指定されたインデックスの記事を下書きに変更
   */
  async draftArticle(index: number): Promise<void> {
    const article = this.getArticleItems().nth(index);
    await article.locator(this.selectors.draftButton).click();
    await this.waitForPageLoad();
  }

  /**
   * ログアウトボタンをクリック
   */
  async logout(): Promise<void> {
    await this.click(this.selectors.logoutButton);
    await this.waitForPageLoad();
  }

  /**
   * フィルターを選択（例：「公開済み」「下書き」）
   */
  async selectFilter(filterText: string): Promise<void> {
    await this.click(this.selectors.filterDropdown);
    await this.page.locator(`text=${filterText}`).click();
    await this.waitForPageLoad();
  }

  /**
   * 特定のタイトルの記事が存在するか確認
   */
  async hasArticleWithTitle(title: string): Promise<boolean> {
    const article = this.page.locator(this.selectors.articleItem, {
      has: this.page.locator(this.selectors.articleTitle, { hasText: title })
    });
    return await article.isVisible();
  }

  /**
   * すべての記事が指定されたステータスか確認
   */
  async areAllArticlesInStatus(status: string): Promise<boolean> {
    const statusElements = this.page.locator(this.selectors.articleStatus);
    const count = await statusElements.count();

    for (let i = 0; i < count; i++) {
      const statusText = await statusElements.nth(i).textContent();
      if (statusText !== status) {
        return false;
      }
    }

    return count > 0;
  }
}
