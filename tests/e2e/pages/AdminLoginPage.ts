import { Page } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * 管理画面ログインページオブジェクト
 * 管理画面のログイン機能の操作を提供
 *
 * Requirements:
 * - R43: E2Eテスト（管理者認証フロー）
 */
export class AdminLoginPage extends BasePage {
  // ページ要素のセレクター
  private readonly selectors = {
    emailInput: '[data-testid="email-input"]',
    passwordInput: '[data-testid="password-input"]',
    loginButton: '[data-testid="login-button"]',
    errorMessage: '[data-testid="error-message"]',
    successMessage: '[data-testid="success-message"]',
    forgotPasswordLink: '[data-testid="forgot-password"]',
    rememberMeCheckbox: '[data-testid="remember-me"]',
  };

  constructor(page: Page) {
    super(page);
  }

  /**
   * ログインページに移動
   */
  async navigate(): Promise<void> {
    // BaseURLからの相対パスでログインページに移動
    await this.goto('/login');
    await this.waitForPageLoad();
  }

  /**
   * メールアドレスを入力
   */
  async enterEmail(email: string): Promise<void> {
    await this.fill(this.selectors.emailInput, email);
  }

  /**
   * パスワードを入力
   */
  async enterPassword(password: string): Promise<void> {
    await this.fill(this.selectors.passwordInput, password);
  }

  /**
   * ログインボタンをクリック
   */
  async clickLogin(): Promise<void> {
    await this.click(this.selectors.loginButton);
    await this.waitForPageLoad();
  }

  /**
   * ログイン操作を実行（メールアドレスとパスワードを入力してログイン）
   */
  async login(email: string, password: string): Promise<void> {
    await this.enterEmail(email);
    await this.enterPassword(password);
    await this.clickLogin();
  }

  /**
   * エラーメッセージが表示されているか確認
   */
  async isErrorMessageVisible(): Promise<boolean> {
    try {
      // エラーメッセージが表示されるまで最大5秒待機
      await this.page.locator(this.selectors.errorMessage).waitFor({
        state: 'visible',
        timeout: 5000,
      });
      return true;
    } catch {
      return false;
    }
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
   * 成功メッセージが表示されているか確認
   */
  async isSuccessMessageVisible(): Promise<boolean> {
    return await this.isElementVisible(this.selectors.successMessage);
  }

  /**
   * 「パスワードを忘れた」リンクをクリック
   */
  async clickForgotPassword(): Promise<void> {
    await this.click(this.selectors.forgotPasswordLink);
    await this.waitForPageLoad();
  }

  /**
   * 「ログイン状態を保持」チェックボックスをチェック
   */
  async checkRememberMe(): Promise<void> {
    await this.page.locator(this.selectors.rememberMeCheckbox).check();
  }

  /**
   * ログインフォームが表示されているか確認
   */
  async isLoginFormVisible(): Promise<boolean> {
    const emailVisible = await this.isElementVisible(this.selectors.emailInput);
    const passwordVisible = await this.isElementVisible(
      this.selectors.passwordInput
    );
    const buttonVisible = await this.isElementVisible(
      this.selectors.loginButton
    );

    return emailVisible && passwordVisible && buttonVisible;
  }

  /**
   * ログインボタンが有効か確認
   */
  async isLoginButtonEnabled(): Promise<boolean> {
    return await this.page.locator(this.selectors.loginButton).isEnabled();
  }

  /**
   * 認証情報をクリア（テスト用）
   */
  async clearCredentials(): Promise<void> {
    await this.clearAllStorage();
  }
}
