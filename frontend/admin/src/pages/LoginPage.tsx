import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
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
    <>
      <div className="login-page">
        <div className="login-container">
          <div className="login-card">
            <div className="login-header">
              <Link to="/" className="login-logo">
                <img
                  src="/logo_name.png"
                  alt="Polylex"
                  className="login-logo-image"
                />
              </Link>
              <span className="login-badge">Admin</span>
            </div>
            <h1 className="login-title">管理画面ログイン</h1>
            <p className="login-subtitle">アカウント情報を入力してください</p>
            <LoginForm
              onLogin={handleLogin}
              error={error || undefined}
              onForgotPassword={handleForgotPassword}
            />
          </div>
        </div>
      </div>

      <style>{`
        .login-page {
          min-height: 100vh;
          background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }

        .login-container {
          width: 100%;
          max-width: 440px;
        }

        .login-card {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 16px;
          padding: 40px;
          box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06);
        }

        .login-header {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          margin-bottom: 32px;
        }

        .login-logo {
          display: flex;
          align-items: center;
        }

        .login-logo-image {
          height: 48px;
          width: auto;
        }

        .login-badge {
          background: #111827;
          color: white;
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .login-title {
          font-size: 1.5rem;
          font-weight: 700;
          color: #111827;
          text-align: center;
          margin: 0 0 8px 0;
        }

        .login-subtitle {
          font-size: 0.95rem;
          color: #6b7280;
          text-align: center;
          margin: 0 0 32px 0;
        }

        /* Override LoginForm styles */
        .login-card input {
          width: 100%;
          padding: 12px 16px;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          font-size: 0.95rem;
          background: white;
          transition: all 0.2s ease;
          box-sizing: border-box;
        }

        .login-card input:focus {
          outline: none;
          border-color: #9ca3af;
          box-shadow: 0 0 0 3px rgba(156, 163, 175, 0.1);
        }

        .login-card input::placeholder {
          color: #9ca3af;
        }

        .login-card button[type="submit"] {
          width: 100%;
          padding: 12px 20px;
          background: #111827;
          color: white;
          border: none;
          border-radius: 10px;
          font-size: 0.95rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .login-card button[type="submit"]:hover {
          background: #374151;
        }

        .login-card button[type="submit"]:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .login-card a,
        .login-card button:not([type="submit"]) {
          color: #6b7280;
          font-size: 0.875rem;
          text-decoration: none;
          transition: color 0.2s ease;
        }

        .login-card a:hover,
        .login-card button:not([type="submit"]):hover {
          color: #111827;
        }

        .login-card label {
          display: block;
          font-size: 0.875rem;
          font-weight: 500;
          color: #374151;
          margin-bottom: 6px;
        }

        @media (max-width: 480px) {
          .login-card {
            padding: 32px 24px;
          }

          .login-logo-image {
            height: 40px;
          }

          .login-title {
            font-size: 1.25rem;
          }
        }
      `}</style>
    </>
  );
};

export default LoginPage;
