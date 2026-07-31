import React, { useState, type FormEvent } from 'react';
import { validateEmail, validatePassword } from '../utils/auth';
import { Button } from './Button';

interface LoginFormProps {
  onLogin: (credentials: {
    email: string;
    password: string;
    rememberMe?: boolean;
  }) => Promise<void>;
  error?: string;
  onForgotPassword?: () => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({
  onLogin,
  error,
  onForgotPassword,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    // バリデーション
    const emailValidation = validateEmail(email);
    const passwordValidation = validatePassword(password);

    setEmailError(emailValidation);
    setPasswordError(passwordValidation);

    // エラーがある場合は送信しない
    if (emailValidation || passwordValidation) {
      return;
    }

    // ログイン処理
    setIsSubmitting(true);
    try {
      await onLogin({ email, password, rememberMe });
    } catch {
      // エラーはLoginPageで処理される
    } finally {
      setIsSubmitting(false);
    }
  };

  // グローバルエラーメッセージを計算（propsのerrorまたはバリデーションエラー）
  const validationErrors = [emailError, passwordError].filter(Boolean);

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 max-w-md mx-auto"
      noValidate
    >
      {/* グローバルエラーメッセージ */}
      {error && (
        <div
          className="admin-alert admin-alert-error"
          data-testid="error-message"
        >
          {error}
        </div>
      )}
      {/* バリデーションエラー */}
      {validationErrors.length > 0 && (
        <div
          className="admin-alert admin-alert-error"
          data-testid="error-message"
        >
          {validationErrors.map((err, idx) => (
            <div key={idx}>{err}</div>
          ))}
        </div>
      )}

      {/* メールアドレス */}
      <div>
        <label htmlFor="email" className="admin-form-label">
          メールアドレス
        </label>
        <input
          id="email"
          data-testid="email-input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={`admin-form-input ${emailError ? 'admin-form-input-error' : ''}`}
          disabled={isSubmitting}
        />
      </div>

      {/* パスワード */}
      <div>
        <label htmlFor="password" className="admin-form-label">
          パスワード
        </label>
        <input
          id="password"
          data-testid="password-input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={`admin-form-input ${passwordError ? 'admin-form-input-error' : ''}`}
          disabled={isSubmitting}
        />
      </div>

      {/* ログイン状態を保持 */}
      <div className="flex items-center justify-between">
        <label className="flex items-center">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            data-testid="remember-me"
            className="mr-2"
          />
          <span className="login-form-remember">ログイン状態を保持</span>
        </label>

        {onForgotPassword && (
          <button
            type="button"
            onClick={onForgotPassword}
            data-testid="forgot-password"
            className="login-form-link"
          >
            パスワードを忘れた
          </button>
        )}
      </div>

      {/* ログインボタン */}
      <Button
        type="submit"
        variant="primary"
        disabled={isSubmitting}
        data-testid="login-button"
      >
        {isSubmitting ? 'ログイン中...' : 'ログイン'}
      </Button>
    </form>
  );
};
