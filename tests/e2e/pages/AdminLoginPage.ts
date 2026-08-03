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
   *
   * ログインの結果 (成功時はダッシュボードへの遷移完了、失敗時はエラー表示) まで
   * ブロックする。失敗時は /login に留まったまま return する。
   *
   * 背景: 旧実装は networkidle のみを待っていたため、`saveAuthToken` (sessionStorage 書込)
   * と navigate('/dashboard') を含む onSuccess コールバックの完了前に return することがあり、
   * 後続の `goto('/posts')` 等のフルページナビゲーションで AuthContext 再初期化時に
   * トークンが見つからず /login にリダイレクトされる flaky を引き起こしていた
   * (admin-crud.spec.ts のローカル失敗の真因)。
   */
  async clickLogin(): Promise<void> {
    await this.click(this.selectors.loginButton);

    // ネットワークレスポンスではなく UI の結果 (成功 = /dashboard への遷移完了、
    // 失敗 = エラーメッセージ表示) を待つ。レスポンス判定は環境非依存にできない:
    // - MSW モック環境は /api/auth/login への単一 POST の status で成否が分かるが、
    // - 実 AWS 環境は Amplify (SRP) 経由のため、認証失敗でも初回 InitiateAuth が
    //   200 を返し、失敗が確定するのは後続の RespondToAuthChallenge。
    // waitForURL の完了まで待つことで、成功時は saveAuthToken →
    // navigate('/dashboard') の完了後に return する従来の保証は維持される。
    const dashboardPromise = this.page
      .waitForURL('**/dashboard', { timeout: 15000 })
      .then(() => 'dashboard' as const);
    const errorPromise = this.page
      .locator(this.selectors.errorMessage)
      .waitFor({ state: 'visible', timeout: 15000 })
      .then(() => 'error' as const);
    // 勝敗決定後に敗者側が timeout で reject しても unhandled rejection に
    // ならないよう、あらかじめ握りつぶしておく
    dashboardPromise.catch(() => {});
    errorPromise.catch(() => {});

    // 失敗時は /login に留まる。エラーメッセージ内容の確認は呼び出し側に任せる。
    await Promise.race([dashboardPromise, errorPromise]);
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
