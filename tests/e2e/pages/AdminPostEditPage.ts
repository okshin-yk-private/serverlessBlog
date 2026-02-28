import { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * 管理画面記事編集ページオブジェクト
 * 記事編集フォームの操作を提供
 *
 * Requirements:
 * - R43: E2Eテスト（記事管理フロー）
 * - R44: E2Eテスト（画像アップロード）
 */
export class AdminPostEditPage extends BasePage {
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
    removeThumbnailButton: '[data-testid="remove-thumbnail-button"]',
    removeImageButton: '[data-testid="remove-image-button"]',

    // アクションボタン
    saveButton: '[data-testid="save-button"]',
    publishButton: '[data-testid="publish-button"]',
    unpublishButton: '[data-testid="unpublish-button"]',
    deleteButton: '[data-testid="delete-post-button"]',
    cancelButton: '[data-testid="cancel-button"]',
    previewButton: '[data-testid="preview-button"]',

    // 確認ダイアログ
    confirmDialog: '[data-testid="confirm-dialog"]',
    confirmYes: '[data-testid="confirm-yes"]',
    confirmNo: '[data-testid="confirm-no"]',

    // バリデーション
    validationError: '[data-testid="validation-error"]',
    fieldError: '[data-testid="field-error"]',
    successMessage: '[data-testid="success-message"]',
    errorMessage: '[data-testid="error-message"]',

    // ローディング状態
    loadingSpinner: '[data-testid="loading-spinner"]',
    savingIndicator: '[data-testid="saving-indicator"]',

    // ステータス表示
    postStatus: '[data-testid="post-status"]',
    lastModified: '[data-testid="last-modified"]',
  };

  constructor(page: Page) {
    super(page);
  }

  /**
   * 記事編集ページに移動（記事IDを指定）
   */
  async navigate(postId: string): Promise<void> {
    await this.goto(`/posts/edit/${postId}`);
    await this.waitForPageLoad();
  }

  /**
   * ページが完全にロードされるまで待機
   */
  async waitForPostLoaded(): Promise<void> {
    await this.waitForElementHidden(this.selectors.loadingSpinner);
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
    await this.page.selectOption(this.selectors.categorySelect, category);
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
   * サムネイル画像を削除
   */
  async removeThumbnail(): Promise<void> {
    await this.click(this.selectors.removeThumbnailButton);
    await this.waitForElementHidden(this.selectors.thumbnailPreview);
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
   * アップロードされた画像を削除
   */
  async removeImage(index: number): Promise<void> {
    const images = this.getUploadedImages();
    await images.nth(index).locator(this.selectors.removeImageButton).click();
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
   * 変更を保存
   */
  async save(): Promise<void> {
    await this.click(this.selectors.saveButton);
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
   * 記事を非公開化
   */
  async unpublish(): Promise<void> {
    await this.click(this.selectors.unpublishButton);
    await this.waitForElementHidden(this.selectors.savingIndicator);
  }

  /**
   * 記事を削除
   */
  async delete(): Promise<void> {
    await this.click(this.selectors.deleteButton);
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
   * フォームを更新
   */
  async updateForm(data: {
    title?: string;
    slug?: string;
    excerpt?: string;
    content?: string;
    category?: string;
    tags?: string;
  }): Promise<void> {
    if (data.title !== undefined) {
      await this.fillTitle(data.title);
    }

    if (data.slug !== undefined) {
      await this.fillSlug(data.slug);
    }

    if (data.excerpt !== undefined) {
      await this.fillExcerpt(data.excerpt);
    }

    if (data.content !== undefined) {
      await this.fillContent(data.content);
    }

    if (data.category !== undefined) {
      await this.selectCategory(data.category);
    }

    if (data.tags !== undefined) {
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
    const errorElement = this.page.locator(
      `${this.selectors.fieldError}[data-field="${fieldName}"]`
    );
    return (await errorElement.textContent()) || '';
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
    return (await element.textContent()) || '';
  }

  /**
   * エラーメッセージのテキストを取得
   */
  async getErrorMessage(): Promise<string> {
    const element = await this.waitForElement(this.selectors.errorMessage);
    return (await element.textContent()) || '';
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

  /**
   * 記事のステータスを取得
   */
  async getPostStatus(): Promise<string> {
    return (
      (await this.page.locator(this.selectors.postStatus).textContent()) || ''
    );
  }

  /**
   * 最終更新日時を取得
   */
  async getLastModified(): Promise<string> {
    return (
      (await this.page.locator(this.selectors.lastModified).textContent()) || ''
    );
  }

  // =====================================================
  // admin-crud.spec.ts用のエイリアスメソッド
  // =====================================================

  /**
   * 公開ステータスを設定（エイリアス）
   * 実際にブラウザ内の公開ステータスselectを操作する
   */
  async setPublishStatus(status: 'published' | 'draft'): Promise<void> {
    // publishStatus selectのid属性を使用（PostEditor.tsxのline 150参照）
    await this.page.selectOption('#publishStatus', status);
  }

  /**
   * 保存ボタンをクリック（エイリアス）
   * 現在のUIの状態に応じて、表示されているボタンをクリックする
   */
  async clickSaveButton(): Promise<void> {
    // 現在表示されているボタンをクリック
    // UIの状態（publishStatus）に応じて、適切なdata-testidを持つボタンが表示されている
    const publishButton = this.page.locator(this.selectors.publishButton);
    const draftButton = this.page.locator(this.selectors.saveDraftButton);

    // どちらのボタンが表示されているか確認してクリック
    if (await publishButton.isVisible()) {
      await publishButton.click();
    } else if (await draftButton.isVisible()) {
      await draftButton.click();
    }
    await this.waitForPageLoad();
  }
}
