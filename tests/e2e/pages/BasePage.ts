import { Page, Locator } from '@playwright/test';

/**
 * ベースページクラス
 * すべてのページオブジェクトで共通の機能を提供
 *
 * Page Object Patternの基底クラスとして、
 * 共通のナビゲーション、待機、検証メソッドを提供
 */
export class BasePage {
  protected readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * 指定されたパスに移動
   * Playwrightのtest baseURL設定が自動的に適用されます
   */
  async goto(path: string = '/'): Promise<void> {
    // ルート絶対パス ('/login' 等) は URL 解決時に baseURL のパス部分を丸ごと
    // 置き換えるため、AWS 環境の admin (baseURL が /admin/ 配下) では /admin が
    // 脱落してしまう。相対パスに変換してから解決することでプレフィックスを保つ。
    // 完全な URL (http...) はそのまま渡す。baseURL がオリジン直下の場合
    // (ローカル各設定) は相対化しても同じ URL に解決される。
    await this.page.goto(
      path.startsWith('http') ? path : path.replace(/^\//, '')
    );
  }

  /**
   * 要素が表示されるまで待機
   */
  async waitForElement(
    selector: string,
    options?: { timeout?: number }
  ): Promise<Locator> {
    const element = this.page.locator(selector);
    await element.waitFor({ state: 'visible', ...options });
    return element;
  }

  /**
   * 要素が非表示になるまで待機
   */
  async waitForElementHidden(
    selector: string,
    options?: { timeout?: number }
  ): Promise<void> {
    const element = this.page.locator(selector);
    await element.waitFor({ state: 'hidden', ...options });
  }

  /**
   * テキストを含む要素を待機
   */
  async waitForText(
    text: string,
    options?: { timeout?: number }
  ): Promise<Locator> {
    const element = this.page.getByText(text);
    await element.waitFor({ state: 'visible', ...options });
    return element;
  }

  /**
   * ページタイトルを取得
   */
  async getTitle(): Promise<string> {
    return await this.page.title();
  }

  /**
   * 現在のURLを取得
   */
  getCurrentURL(): string {
    return this.page.url();
  }

  /**
   * スクリーンショットを撮影
   */
  async takeScreenshot(name: string): Promise<Buffer> {
    return await this.page.screenshot({
      path: `test-results/screenshots/${name}.png`,
      fullPage: true,
    });
  }

  /**
   * ページロード完了を待機
   */
  async waitForPageLoad(): Promise<void> {
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * 要素をクリック
   */
  async click(selector: string): Promise<void> {
    await this.page.click(selector);
  }

  /**
   * テキストを入力
   */
  async fill(selector: string, text: string): Promise<void> {
    await this.page.fill(selector, text);
  }

  /**
   * 要素が存在するか確認
   */
  async isElementVisible(selector: string): Promise<boolean> {
    try {
      return await this.page.locator(selector).isVisible();
    } catch {
      return false;
    }
  }

  /**
   * ローカルストレージをクリア
   */
  async clearLocalStorage(): Promise<void> {
    await this.page.evaluate(() => localStorage.clear());
  }

  /**
   * セッションストレージをクリア
   */
  async clearSessionStorage(): Promise<void> {
    await this.page.evaluate(() => sessionStorage.clear());
  }

  /**
   * Cookieをクリア
   */
  async clearCookies(): Promise<void> {
    await this.page.context().clearCookies();
  }

  /**
   * すべてのストレージをクリア
   */
  async clearAllStorage(): Promise<void> {
    await this.clearLocalStorage();
    await this.clearSessionStorage();
    await this.clearCookies();
  }
}
