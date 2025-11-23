import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LoginForm } from '../components/LoginForm';
import { useAuth } from '../hooks/useAuth';

/**
 * エラーオブジェクトの型ガード
 */
const isErrorWithMessage = (error: unknown): error is { message: string } => {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  );
};

const LoginPage = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (credentials: {
    email: string;
    password: string;
    rememberMe?: boolean;
  }) => {
    try {
      setError(null);
      await login(credentials.email, credentials.password);

      // ログイン状態を保持する場合の処理は AuthContext で実装済み
      navigate('/dashboard');
    } catch (err) {
      console.error('ログインエラー:', err);
      // エラーメッセージを日本語化
      const errorMessageMap: Record<string, string> = {
        'Invalid credentials':
          'ログインに失敗しました。メールアドレスとパスワードを確認してください。',
        'Network error':
          'ログインに失敗しました。メールアドレスとパスワードを確認してください。',
      };
      const errorMessage = isErrorWithMessage(err)
        ? errorMessageMap[err.message] ||
          err.message ||
          'ログインに失敗しました。メールアドレスとパスワードを確認してください。'
        : 'ログインに失敗しました。メールアドレスとパスワードを確認してください。';
      setError(errorMessage);
    }
  };

  const handleForgotPassword = () => {
    // パスワードリセットページへ遷移
    navigate('/forgot-password');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <h1 className="text-2xl font-bold mb-6 text-center">
          管理画面ログイン
        </h1>
        <LoginForm
          onLogin={handleLogin}
          error={error || undefined}
          onForgotPassword={handleForgotPassword}
        />
      </div>
    </div>
  );
};

export default LoginPage;
