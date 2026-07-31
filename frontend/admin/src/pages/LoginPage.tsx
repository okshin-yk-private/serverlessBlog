import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { LoginForm } from '../components/LoginForm';
import { useAuth } from '../hooks/useAuth';
import { validatePassword } from '../utils/auth';

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
  const {
    login,
    requiresNewPassword,
    pendingEmail,
    confirmNewPassword,
    cancelNewPassword,
  } = useAuth();
  const [error, setError] = useState<string | null>(null);

  // 新パスワード設定用の状態
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmPasswordError, setConfirmPasswordError] = useState<
    string | null
  >(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogin = async (credentials: {
    email: string;
    password: string;
    rememberMe?: boolean;
  }) => {
    try {
      setError(null);
      const result = await login(credentials.email, credentials.password);

      // 新パスワードが必要な場合はダッシュボードに遷移しない（LoginPageが新パスワード設定画面を表示）
      if (!result.requiresNewPassword) {
        navigate('/dashboard');
      }
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

  const handleNewPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // バリデーション
    let hasError = false;

    const passwordValidation = validatePassword(newPassword);
    setPasswordError(passwordValidation);
    if (passwordValidation) {
      hasError = true;
    }

    if (newPassword !== confirmPassword) {
      setConfirmPasswordError('パスワードが一致しません。');
      hasError = true;
    } else {
      setConfirmPasswordError(null);
    }

    if (hasError) {
      return;
    }

    setIsSubmitting(true);
    try {
      await confirmNewPassword(newPassword);
      navigate('/dashboard');
    } catch (err) {
      console.error('パスワード変更エラー:', err);
      if (isErrorWithMessage(err)) {
        if (
          err.message.includes('InvalidPasswordException') ||
          err.message.includes('password')
        ) {
          setError(
            'パスワードが要件を満たしていません。8文字以上で、大文字・小文字・数字を含めてください。'
          );
        } else {
          setError(err.message || 'パスワードの変更に失敗しました。');
        }
      } else {
        setError('パスワードの変更に失敗しました。');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelNewPassword = () => {
    cancelNewPassword();
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError(null);
    setConfirmPasswordError(null);
    setError(null);
  };

  const handleForgotPassword = () => {
    // パスワードリセットページへ遷移
    navigate('/forgot-password');
  };

  // 新パスワード設定画面
  if (requiresNewPassword) {
    return (
      <>
        <div className="login-page">
          <div className="login-container">
            <div className="login-card">
              <div className="login-header">
                <Link to="/" className="login-logo">
                  <img
                    src="/logo-light.png"
                    alt="Bone of my fallacy"
                    className="login-logo-image login-logo-image-light"
                  />
                  <img
                    src="/logo-dark.png"
                    alt=""
                    aria-hidden="true"
                    className="login-logo-image login-logo-image-dark"
                  />
                </Link>
                <span className="login-badge">Admin</span>
              </div>
              <h1 className="login-title">新しいパスワードを設定</h1>
              <p className="login-subtitle">
                初回ログインのため、新しいパスワードを設定してください。
                <br />
                <span className="login-email">{pendingEmail}</span>
              </p>

              <form onSubmit={handleNewPasswordSubmit}>
                {error && <div className="login-error">{error}</div>}

                <div className="login-field">
                  <label htmlFor="newPassword" className="login-label">
                    新しいパスワード
                  </label>
                  <input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className={`login-input ${passwordError ? 'error' : ''}`}
                    disabled={isSubmitting}
                    autoComplete="new-password"
                  />
                  {passwordError && (
                    <div className="login-field-error">{passwordError}</div>
                  )}
                </div>

                <div className="login-field">
                  <label htmlFor="confirmPassword" className="login-label">
                    新しいパスワード（確認）
                  </label>
                  <input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={`login-input ${confirmPasswordError ? 'error' : ''}`}
                    disabled={isSubmitting}
                    autoComplete="new-password"
                  />
                  {confirmPasswordError && (
                    <div className="login-field-error">
                      {confirmPasswordError}
                    </div>
                  )}
                </div>

                <p className="login-password-hint">
                  パスワードは8文字以上で、大文字・小文字・数字を含めてください。
                </p>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="login-btn-primary"
                >
                  {isSubmitting ? '設定中...' : 'パスワードを設定'}
                </button>

                <button
                  type="button"
                  onClick={handleCancelNewPassword}
                  className="login-btn-link"
                >
                  キャンセル
                </button>
              </form>
            </div>
          </div>
        </div>

        <style>{`
          .login-page {
            min-height: 100vh;
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
            background: var(--color-surface);
            border: 1px solid var(--color-border);
            border-radius: 24px;
            padding: 40px;
            box-shadow: var(--shadow-card);
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
            display: block;
            height: 52px;
            width: auto;
            max-width: 210px;
            object-fit: contain;
          }

          .login-logo-image-light {
            mix-blend-mode: multiply;
          }

          .login-logo-image-dark {
            display: none;
          }

          :root[data-theme="dark"] .login-logo-image-light {
            display: none;
          }

          :root[data-theme="dark"] .login-logo-image-dark {
            display: block;
          }

          .login-badge {
            background: var(--color-primary-soft);
            color: var(--color-primary);
            padding: 5px 12px;
            border-radius: 999px;
            font-family: var(--font-display);
            font-size: 0.62rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.12em;
          }

          .login-title {
            font-family: var(--font-display);
            font-size: 1.5rem;
            font-weight: 600;
            letter-spacing: -0.035em;
            color: var(--color-text-heading);
            text-align: center;
            margin: 0 0 8px 0;
          }

          .login-subtitle {
            font-size: 0.95rem;
            color: var(--color-text-muted);
            text-align: center;
            margin: 0 0 24px 0;
            line-height: 1.6;
          }

          .login-email {
            color: var(--color-primary);
            font-weight: 500;
          }

          .login-field {
            margin-bottom: 20px;
          }

          .login-label {
            display: block;
            font-family: var(--font-display);
            font-size: 0.72rem;
            font-weight: 600;
            letter-spacing: 0.12em;
            text-transform: uppercase;
            color: var(--color-text-muted);
            margin-bottom: 10px;
          }

          .login-input {
            width: 100%;
            padding: 12px 16px;
            border: 1px solid var(--color-border);
            border-radius: 999px;
            font-family: var(--font-body);
            font-size: 0.95rem;
            background: var(--color-surface);
            color: var(--color-text-heading);
            transition: all 0.2s ease;
            box-sizing: border-box;
          }

          .login-input:focus {
            outline: none;
            border-color: var(--color-accent);
            box-shadow: 0 0 0 4px var(--color-focus-ring);
          }

          .login-input.error {
            border-color: var(--color-danger);
          }

          .login-input:disabled {
            background: var(--color-surface-elevated);
            color: var(--color-text-muted);
          }

          .login-error {
            background: var(--color-danger-bg);
            border: 1px solid var(--color-danger-border);
            color: var(--color-danger-text);
            padding: 12px 16px;
            border-radius: 999px;
            margin-bottom: 20px;
            font-size: 0.875rem;
          }

          .login-field-error {
            color: var(--color-danger);
            font-size: 0.8rem;
            margin-top: 6px;
          }

          .login-password-hint {
            font-size: 0.8rem;
            color: var(--color-text-muted);
            margin: 0 0 20px 0;
          }

          .login-btn-primary {
            width: 100%;
            padding: 12px 20px;
            background: var(--color-primary);
            color: var(--color-text-on-primary);
            border: none;
            border-radius: 999px;
            font-family: var(--font-display);
            font-size: 0.9rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
            margin-bottom: 16px;
          }

          .login-btn-primary:hover {
            background: var(--color-primary-hover);
          }

          .login-btn-primary:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }

          .login-btn-link {
            width: 100%;
            padding: 8px 16px;
            background: transparent;
            color: var(--color-text-muted);
            border: none;
            font-size: 0.875rem;
            cursor: pointer;
            transition: color 0.2s ease;
          }

          .login-btn-link:hover {
            color: var(--color-primary);
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
  }

  return (
    <>
      <div className="login-page">
        <div className="login-container">
          <div className="login-card">
            <div className="login-header">
              <Link to="/" className="login-logo">
                <img
                  src="/logo-light.png"
                  alt="Bone of my fallacy"
                  className="login-logo-image login-logo-image-light"
                />
                <img
                  src="/logo-dark.png"
                  alt=""
                  aria-hidden="true"
                  className="login-logo-image login-logo-image-dark"
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
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: 24px;
          padding: 40px;
          box-shadow: var(--shadow-card);
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
          display: block;
          height: 52px;
          width: auto;
          max-width: 210px;
          object-fit: contain;
        }

        .login-logo-image-light {
          mix-blend-mode: multiply;
        }

        .login-logo-image-dark {
          display: none;
        }

        :root[data-theme="dark"] .login-logo-image-light {
          display: none;
        }

        :root[data-theme="dark"] .login-logo-image-dark {
          display: block;
        }

        .login-badge {
          background: var(--color-primary-soft);
          color: var(--color-primary);
          padding: 5px 12px;
          border-radius: 999px;
          font-family: var(--font-display);
          font-size: 0.62rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.12em;
        }

        .login-title {
          font-family: var(--font-display);
          font-size: 1.5rem;
          font-weight: 600;
          letter-spacing: -0.035em;
          color: var(--color-text-heading);
          text-align: center;
          margin: 0 0 8px 0;
        }

        .login-subtitle {
          font-size: 0.95rem;
          color: var(--color-text-muted);
          text-align: center;
          margin: 0 0 32px 0;
        }

        /* Override LoginForm styles */
        .login-card input {
          width: 100%;
          padding: 12px 16px;
          border: 1px solid var(--color-border);
          border-radius: 999px;
          font-family: var(--font-body);
          font-size: 0.95rem;
          background: var(--color-surface);
          color: var(--color-text-heading);
          transition: all 0.2s ease;
          box-sizing: border-box;
        }

        .login-card input:focus {
          outline: none;
          border-color: var(--color-accent);
          box-shadow: 0 0 0 4px var(--color-focus-ring);
        }

        .login-card input::placeholder {
          color: var(--color-text-muted);
        }

        .login-card button[type="submit"] {
          width: 100%;
          padding: 12px 20px;
          background: var(--color-primary);
          color: var(--color-text-on-primary);
          border: none;
          border-radius: 999px;
          font-family: var(--font-display);
          font-size: 0.9rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .login-card button[type="submit"]:hover {
          background: var(--color-primary-hover);
        }

        .login-card button[type="submit"]:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .login-card a,
        .login-card button:not([type="submit"]) {
          color: var(--color-text-muted);
          font-size: 0.875rem;
          text-decoration: none;
          transition: color 0.2s ease;
        }

        .login-card a:hover,
        .login-card button:not([type="submit"]):hover {
          color: var(--color-primary);
        }

        .login-card label {
          display: block;
          font-size: 0.875rem;
          font-weight: 500;
          color: var(--color-text);
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
