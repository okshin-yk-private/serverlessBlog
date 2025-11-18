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
    } catch (_err) {
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
          className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded"
          data-testid="error-message"
        >
          {error}
        </div>
      )}
      {/* バリデーションエラー */}
      {validationErrors.length > 0 && (
        <div
          className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded"
          data-testid="error-message"
        >
          {validationErrors.map((err, idx) => (
            <div key={idx}>{err}</div>
          ))}
        </div>
      )}

      {/* メールアドレス */}
      <div>
        <label
          htmlFor="email"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          メールアドレス
        </label>
        <input
          id="email"
          data-testid="email-input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            emailError ? 'border-red-500' : 'border-gray-300'
          }`}
          disabled={isSubmitting}
        />
      </div>

      {/* パスワード */}
      <div>
        <label
          htmlFor="password"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          パスワード
        </label>
        <input
          id="password"
          data-testid="password-input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            passwordError ? 'border-red-500' : 'border-gray-300'
          }`}
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
          <span className="text-sm text-gray-700">ログイン状態を保持</span>
        </label>

        {onForgotPassword && (
          <button
            type="button"
            onClick={onForgotPassword}
            data-testid="forgot-password"
            className="text-sm text-blue-600 hover:text-blue-800"
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
