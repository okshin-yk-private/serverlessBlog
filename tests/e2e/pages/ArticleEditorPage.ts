import { Page } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * 記事編集ページオブジェクト
 * 管理画面の記事作成・編集機能の操作を提供
 *
 * Requirements:
 * - R43: E2Eテスト（記事作成・編集フロー、画像アップロード）
 */
export class ArticleEditorPage extends BasePage {
  // ページ要素のセレクター
  private readonly selectors = {
    titleInput: '[data-testid="article-title-input"]',
    contentEditor: '[data-testid="article-content-editor"]',
    categorySelect: '[data-testid="article-category-select"]',
    imageUploadInput: '[data-testid="image-upload-input"]',
    imagePreview: '[data-testid="image-preview"]',
    saveButton: '[data-testid="save-article-button"]',
    publishButton: '[data-testid="publish-article-button"]',
    draftButton: '[data-testid="save-as-draft-button"]',
    cancelButton: '[data-testid="cancel-button"]',
    previewButton: '[data-testid="preview-button"]',
    successMessage: '[data-testid="success-message"]',
    errorMessage: '[data-testid="error-message"]',
    validationError: '[data-testid="validation-error"]',
    removeImageButton: '[data-testid="remove-image-button"]',
  };

  constructor(page: Page) {
    super(page);
  }

  /**
   * 新規記事作成ページに移動
   */
  async navigateToNew(): Promise<void> {
    await this.goto('/admin/articles/new');
    await this.waitForPageLoad();
  }

  /**
   * 記事編集ページに移動
   */
  async navigateToEdit(articleId: string): Promise<void> {
    await this.goto(`/admin/articles/${articleId}/edit`);
    await this.waitForPageLoad();
  }

  /**
   * 記事タイトルを入力
   */
  async enterTitle(title: string): Promise<void> {
    await this.fill(this.selectors.titleInput, title);
  }

  /**
   * 記事内容を入力
   */
  async enterContent(content: string): Promise<void> {
    await this.fill(this.selectors.contentEditor, content);
  }

  /**
   * カテゴリを選択
   */
  async selectCategory(category: string): Promise<void> {
    await this.page
      .locator(this.selectors.categorySelect)
      .selectOption(category);
  }

  /**
   * 画像をアップロード
   */
  async uploadImage(filePath: string): Promise<void> {
    const fileInput = this.page.locator(this.selectors.imageUploadInput);
    await fileInput.setInputFiles(filePath);
    // 画像プレビューが表示されるまで待機
    await this.waitForElement(this.selectors.imagePreview);
  }

  /**
   * 画像プレビューが表示されているか確認
   */
  async isImagePreviewVisible(): Promise<boolean> {
    return await this.isElementVisible(this.selectors.imagePreview);
  }

  /**
   * 画像を削除
   */
  async removeImage(): Promise<void> {
    await this.click(this.selectors.removeImageButton);
    await this.waitForElementHidden(this.selectors.imagePreview);
  }

  /**
   * 保存ボタンをクリック
   */
  async clickSave(): Promise<void> {
    await this.click(this.selectors.saveButton);
    await this.waitForPageLoad();
  }

  /**
   * 公開ボタンをクリック
   */
  async clickPublish(): Promise<void> {
    await this.click(this.selectors.publishButton);
    await this.waitForPageLoad();
  }

  /**
   * 下書き保存ボタンをクリック
   */
  async clickSaveAsDraft(): Promise<void> {
    await this.click(this.selectors.draftButton);
    await this.waitForPageLoad();
  }

  /**
   * キャンセルボタンをクリック
   */
  async clickCancel(): Promise<void> {
    await this.click(this.selectors.cancelButton);
    await this.waitForPageLoad();
  }

  /**
   * プレビューボタンをクリック
   */
  async clickPreview(): Promise<void> {
    await this.click(this.selectors.previewButton);
    // プレビューは新しいウィンドウまたはモーダルで開く可能性がある
  }

  /**
   * 記事を作成（タイトル、内容、カテゴリを入力して公開）
   */
  async createArticle(
    title: string,
    content: string,
    category: string
  ): Promise<void> {
    await this.enterTitle(title);
    await this.enterContent(content);
    await this.selectCategory(category);
    await this.clickPublish();
  }

  /**
   * 画像付きの記事を作成
   */
  async createArticleWithImage(
    title: string,
    content: string,
    category: string,
    imagePath: string
  ): Promise<void> {
    await this.enterTitle(title);
    await this.enterContent(content);
    await this.selectCategory(category);
    await this.uploadImage(imagePath);
    await this.clickPublish();
  }

  /**
   * 下書きとして保存
   */
  async saveDraft(
    title: string,
    content: string,
    category: string
  ): Promise<void> {
    await this.enterTitle(title);
    await this.enterContent(content);
    await this.selectCategory(category);
    await this.clickSaveAsDraft();
  }

  /**
   * 成功メッセージが表示されているか確認
   */
  async isSuccessMessageVisible(): Promise<boolean> {
    return await this.isElementVisible(this.selectors.successMessage);
  }

  /**
   * 成功メッセージを取得
   */
  async getSuccessMessage(): Promise<string> {
    return (
      (await this.page.locator(this.selectors.successMessage).textContent()) ||
      ''
    );
  }

  /**
   * エラーメッセージが表示されているか確認
   */
  async isErrorMessageVisible(): Promise<boolean> {
    return await this.isElementVisible(this.selectors.errorMessage);
  }

  /**
   * エラーメッセージを取得
   */
  async getErrorMessage(): Promise<string> {
    return (
      (await this.page.locator(this.selectors.errorMessage).textContent()) || ''
    );
  }

  /**
   * バリデーションエラーが表示されているか確認
   */
  async hasValidationErrors(): Promise<boolean> {
    return await this.isElementVisible(this.selectors.validationError);
  }

  /**
   * 現在のタイトルを取得
   */
  async getCurrentTitle(): Promise<string> {
    return await this.page.locator(this.selectors.titleInput).inputValue();
  }

  /**
   * 現在の内容を取得
   */
  async getCurrentContent(): Promise<string> {
    return await this.page.locator(this.selectors.contentEditor).inputValue();
  }

  /**
   * 公開ボタンが有効か確認
   */
  async isPublishButtonEnabled(): Promise<boolean> {
    return await this.page.locator(this.selectors.publishButton).isEnabled();
  }
}
