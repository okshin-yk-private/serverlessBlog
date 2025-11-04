import { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * 管理画面記事作成ページオブジェクト
 * 記事作成フォームの操作を提供
 *
 * Requirements:
 * - R43: E2Eテスト（記事管理フロー）
 * - R44: E2Eテスト（画像アップロード）
 */
export class AdminPostCreatePage extends BasePage {
  // ページ要素のセレクター
  private readonly selectors = {
    // フォームフィールド
    titleInput: '[data-testid="post-title-input"]',
    slugInput: '[data-testid="post-slug-input"]',
    excerptInput: '[data-testid="post-excerpt-input"]',
    contentEditor: '[data-testid="post-content-editor"]',
    categorySelect: '[data-testid="post-category-select"]',
    tagsInput: '[data-testid="post-tags-input"]',

    // 画像アップロード
    thumbnailUpload: '[data-testid="thumbnail-upload-input"]',
    thumbnailPreview: '[data-testid="thumbnail-preview"]',
    imageUploadButton: '[data-testid="image-upload-button"]',
    imageUploadInput: '[data-testid="image-upload-input"]',
    uploadedImageList: '[data-testid="uploaded-image-list"]',
    uploadedImageItem: '[data-testid="uploaded-image-item"]',

    // アクションボタン
    saveDraftButton: '[data-testid="save-draft-button"]',
    publishButton: '[data-testid="publish-button"]',
    cancelButton: '[data-testid="cancel-button"]',
    previewButton: '[data-testid="preview-button"]',

    // バリデーション
    validationError: '[data-testid="validation-error"]',
    fieldError: '[data-testid="field-error"]',
    successMessage: '[data-testid="success-message"]',
    errorMessage: '[data-testid="error-message"]',

    // ローディング状態
    loadingSpinner: '[data-testid="loading-spinner"]',
    savingIndicator: '[data-testid="saving-indicator"]',
  };

  constructor(page: Page) {
    super(page);
  }

  /**
   * 記事作成ページに移動
   */
  async navigate(): Promise<void> {
    await this.goto('/posts/new');
    await this.waitForPageLoad();
  }

  /**
   * タイトルを入力
   */
  async fillTitle(title: string): Promise<void> {
    await this.fill(this.selectors.titleInput, title);
  }

  /**
   * スラッグを入力
   */
  async fillSlug(slug: string): Promise<void> {
    await this.fill(this.selectors.slugInput, slug);
  }

  /**
   * 抜粋を入力
   */
  async fillExcerpt(excerpt: string): Promise<void> {
    await this.fill(this.selectors.excerptInput, excerpt);
  }

  /**
   * 本文を入力
   */
  async fillContent(content: string): Promise<void> {
    await this.fill(this.selectors.contentEditor, content);
  }

  /**
   * カテゴリを選択
   */
  async selectCategory(category: string): Promise<void> {
    await this.click(this.selectors.categorySelect);
    await this.page.locator(`text=${category}`).click();
  }

  /**
   * タグを入力
   */
  async fillTags(tags: string): Promise<void> {
    await this.fill(this.selectors.tagsInput, tags);
  }

  /**
   * サムネイル画像をアップロード
   */
  async uploadThumbnail(filePath: string): Promise<void> {
    const fileInput = this.page.locator(this.selectors.thumbnailUpload);
    await fileInput.setInputFiles(filePath);
    await this.waitForElement(this.selectors.thumbnailPreview);
  }

  /**
   * コンテンツ画像をアップロード
   */
  async uploadImage(filePath: string): Promise<void> {
    const fileInput = this.page.locator(this.selectors.imageUploadInput);
    await fileInput.setInputFiles(filePath);
    await this.waitForPageLoad();
  }

  /**
   * アップロードされた画像一覧を取得
   */
  getUploadedImages(): Locator {
    return this.page.locator(this.selectors.uploadedImageItem);
  }

  /**
   * アップロードされた画像の数を取得
   */
  async getUploadedImageCount(): Promise<number> {
    return await this.getUploadedImages().count();
  }

  /**
   * 下書きとして保存
   */
  async saveDraft(): Promise<void> {
    await this.click(this.selectors.saveDraftButton);
    await this.waitForElementHidden(this.selectors.savingIndicator);
  }

  /**
   * 記事を公開
   */
  async publish(): Promise<void> {
    await this.click(this.selectors.publishButton);
    await this.waitForElementHidden(this.selectors.savingIndicator);
  }

  /**
   * プレビューボタンをクリック
   */
  async clickPreview(): Promise<void> {
    await this.click(this.selectors.previewButton);
  }

  /**
   * キャンセルボタンをクリック
   */
  async cancel(): Promise<void> {
    await this.click(this.selectors.cancelButton);
    await this.waitForPageLoad();
  }

  /**
   * 完全なフォームに入力
   */
  async fillCompleteForm(data: {
    title: string;
    slug?: string;
    excerpt?: string;
    content: string;
    category?: string;
    tags?: string;
  }): Promise<void> {
    await this.fillTitle(data.title);

    if (data.slug) {
      await this.fillSlug(data.slug);
    }

    if (data.excerpt) {
      await this.fillExcerpt(data.excerpt);
    }

    await this.fillContent(data.content);

    if (data.category) {
      await this.selectCategory(data.category);
    }

    if (data.tags) {
      await this.fillTags(data.tags);
    }
  }

  /**
   * バリデーションエラーが表示されているか確認
   */
  async hasValidationError(): Promise<boolean> {
    return await this.isElementVisible(this.selectors.validationError);
  }

  /**
   * 特定のフィールドのエラーメッセージを取得
   */
  async getFieldError(fieldName: string): Promise<string> {
    const errorElement = this.page.locator(`${this.selectors.fieldError}[data-field="${fieldName}"]`);
    return await errorElement.textContent() || '';
  }

  /**
   * 成功メッセージが表示されているか確認
   */
  async hasSuccessMessage(): Promise<boolean> {
    return await this.isElementVisible(this.selectors.successMessage);
  }

  /**
   * エラーメッセージが表示されているか確認
   */
  async hasErrorMessage(): Promise<boolean> {
    return await this.isElementVisible(this.selectors.errorMessage);
  }

  /**
   * 成功メッセージのテキストを取得
   */
  async getSuccessMessage(): Promise<string> {
    const element = await this.waitForElement(this.selectors.successMessage);
    return await element.textContent() || '';
  }

  /**
   * エラーメッセージのテキストを取得
   */
  async getErrorMessage(): Promise<string> {
    const element = await this.waitForElement(this.selectors.errorMessage);
    return await element.textContent() || '';
  }

  /**
   * ローディング中か確認
   */
  async isLoading(): Promise<boolean> {
    return await this.isElementVisible(this.selectors.loadingSpinner);
  }

  /**
   * 保存中か確認
   */
  async isSaving(): Promise<boolean> {
    return await this.isElementVisible(this.selectors.savingIndicator);
  }

  /**
   * タイトルフィールドの値を取得
   */
  async getTitleValue(): Promise<string> {
    return await this.page.locator(this.selectors.titleInput).inputValue();
  }

  /**
   * コンテンツフィールドの値を取得
   */
  async getContentValue(): Promise<string> {
    return await this.page.locator(this.selectors.contentEditor).inputValue();
  }
}
