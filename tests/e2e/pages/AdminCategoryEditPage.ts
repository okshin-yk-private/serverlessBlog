import { Page } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * 管理画面カテゴリ作成・編集ページオブジェクト
 *
 * Requirements:
 * - R43: UI E2Eテスト（最小限）（カテゴリ管理）
 */
export class AdminCategoryEditPage extends BasePage {
  private readonly selectors = {
    form: '[data-testid="category-form"]',
    nameInput: '[data-testid="name-input"]',
    descriptionInput: '[data-testid="description-input"]',
    submitButton: '[data-testid="submit-button"]',
    cancelButton: '[data-testid="cancel-button"]',
    errorMessage: '[data-testid="error-message"]',
    nameError: '[data-testid="name-error"]',
  };

  constructor(page: Page) {
    super(page);
  }

  async navigateNew(): Promise<void> {
    await this.goto('/categories/new');
    await this.waitForElement(this.selectors.nameInput);
  }

  async navigateEdit(id: string): Promise<void> {
    await this.goto(`/categories/edit/${id}`);
    await this.waitForElement(this.selectors.nameInput);
  }

  async fillName(name: string): Promise<void> {
    await this.fill(this.selectors.nameInput, name);
  }

  async fillDescription(description: string): Promise<void> {
    await this.fill(this.selectors.descriptionInput, description);
  }

  async submit(): Promise<void> {
    await this.click(this.selectors.submitButton);
  }

  async submitAndWaitForList(): Promise<void> {
    await this.submit();
    await this.page.waitForURL(/\/categories(\?.*)?$/, { timeout: 10000 });
    // 一覧画面側の useEffect (fetchCategories) が完了するのを待つ
    await this.page.waitForLoadState('networkidle');
    await Promise.race([
      this.page
        .locator('[data-testid="category-list"]')
        .waitFor({ state: 'visible', timeout: 10000 }),
      this.page
        .getByText('カテゴリがありません', { exact: false })
        .waitFor({ state: 'visible', timeout: 10000 }),
    ]);
  }

  async getNameValue(): Promise<string> {
    return (
      (await this.page.locator(this.selectors.nameInput).inputValue()) || ''
    );
  }
}
