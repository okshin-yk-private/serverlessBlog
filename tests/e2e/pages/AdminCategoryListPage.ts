import { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * 管理画面カテゴリ一覧ページオブジェクト
 *
 * Requirements:
 * - R43: UI E2Eテスト（最小限）（カテゴリ管理）
 */
export class AdminCategoryListPage extends BasePage {
  private readonly selectors = {
    newCategoryButton: '[data-testid="new-category-button"]',
    categoryList: '[data-testid="category-list"]',
    categoryItem: '[data-testid="category-item"]',
    categoryName: '[data-testid="category-name"]',
    editButton: '[data-testid="edit-category-button"]',
    deleteButton: '[data-testid="delete-category-button"]',
    confirmYes: '[data-testid="confirm-yes"]',
    successMessage: '[data-testid="success-message"]',
    errorMessage: '[data-testid="error-message"]',
  };

  constructor(page: Page) {
    super(page);
  }

  async navigate(): Promise<void> {
    await this.goto('/categories');
    await this.page.waitForURL('**/categories', { timeout: 30000 });
    await this.page.waitForTimeout(500);

    if (this.page.url().includes('/login')) {
      throw new Error(
        'Authentication failed: Redirected to /login. Check VITE_ENABLE_MSW_MOCK.'
      );
    }

    await this.waitForElement(this.selectors.newCategoryButton, {
      timeout: 30000,
    });
    await this.waitForListLoaded();
  }

  /**
   * カテゴリ取得 useEffect が完了し、リストまたは空状態が描画されるまで待つ
   */
  async waitForListLoaded(): Promise<void> {
    await this.page.waitForLoadState('networkidle');
    await Promise.race([
      this.page.locator(this.selectors.categoryList).waitFor({
        state: 'visible',
        timeout: 10000,
      }),
      this.page
        .getByText('カテゴリがありません', { exact: false })
        .waitFor({ state: 'visible', timeout: 10000 }),
    ]);
  }

  getCategoryItems(): Locator {
    return this.page.locator(this.selectors.categoryItem);
  }

  async getCategoryCount(): Promise<number> {
    return await this.getCategoryItems().count();
  }

  async getCategoryNames(): Promise<string[]> {
    const items = this.getCategoryItems();
    const count = await items.count();
    const names: string[] = [];
    for (let i = 0; i < count; i++) {
      const text = await items
        .nth(i)
        .locator(this.selectors.categoryName)
        .textContent();
      names.push((text ?? '').trim());
    }
    return names;
  }

  async hasCategoryWithName(name: string): Promise<boolean> {
    const names = await this.getCategoryNames();
    return names.includes(name.trim());
  }

  async clickNewCategoryButton(): Promise<void> {
    await this.click(this.selectors.newCategoryButton);
    await this.page.waitForURL('**/categories/new', { timeout: 10000 });
  }

  async clickEditByName(name: string): Promise<void> {
    const items = this.getCategoryItems();
    const count = await items.count();
    for (let i = 0; i < count; i++) {
      const text = (
        await items.nth(i).locator(this.selectors.categoryName).textContent()
      )?.trim();
      if (text === name.trim()) {
        await items.nth(i).locator(this.selectors.editButton).click();
        await this.page.waitForURL('**/categories/edit/**', { timeout: 10000 });
        return;
      }
    }
    throw new Error(`Category with name "${name}" not found`);
  }

  async deleteByName(name: string): Promise<void> {
    const items = this.getCategoryItems();
    const count = await items.count();
    for (let i = 0; i < count; i++) {
      const text = (
        await items.nth(i).locator(this.selectors.categoryName).textContent()
      )?.trim();
      if (text === name.trim()) {
        await items.nth(i).locator(this.selectors.deleteButton).click();
        await this.waitForElement(this.selectors.confirmYes);
        await this.click(this.selectors.confirmYes);
        return;
      }
    }
    throw new Error(`Category with name "${name}" not found`);
  }

  async waitForSuccessMessage(): Promise<void> {
    await this.waitForElement(this.selectors.successMessage, {
      timeout: 10000,
    });
  }
}
