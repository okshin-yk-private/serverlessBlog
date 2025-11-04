import React, { useState, type FormEvent } from 'react';
import { validateEmail, validatePassword } from '../utils/auth';
import { Button } from './Button';

interface LoginFormProps {
  onLogin: (credentials: { email: string; password: string }) => Promise<void>;
  error?: string;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onLogin, error }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
      await onLogin({ email, password });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md mx-auto" noValidate>
      {/* グローバルエラーメッセージ */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded" data-testid="error-message">
          {error}
        </div>
      )}

      {/* メールアドレス */}
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
          メールアドレス
        </label>
        <input
          id="email"
          data-testid="email-input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={isSubmitting}
        />
        {emailError && (
          <p className="mt-1 text-sm text-red-600" data-testid="validation-error">{emailError}</p>
        )}
      </div>

      {/* パスワード */}
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
          パスワード
        </label>
        <input
          id="password"
          data-testid="password-input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={isSubmitting}
        />
        {passwordError && (
          <p className="mt-1 text-sm text-red-600" data-testid="validation-error">{passwordError}</p>
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
