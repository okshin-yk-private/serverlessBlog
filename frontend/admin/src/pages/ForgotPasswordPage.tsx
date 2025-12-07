import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { validateEmail } from '../utils/auth';

const ForgotPasswordPage = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // バリデーション
    const emailValidation = validateEmail(email);
    setEmailError(emailValidation);

    if (emailValidation) {
      return;
    }

    // パスワードリセットリクエスト送信
    setIsSubmitting(true);
    try {
      // TODO: API実装時にパスワードリセットAPIを呼び出す
      await new Promise((resolve) => setTimeout(resolve, 1000)); // 仮の遅延

      setSuccessMessage(
        'パスワードリセットのリンクをメールアドレスに送信しました。'
      );
      setEmail('');
    } catch (err) {
      console.error('パスワードリセットエラー:', err);
      setEmailError('パスワードリセットのリクエストに失敗しました。');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBackToLogin = () => {
    navigate('/login');
  };

  return (
    <>
      <div className="forgot-page">
        <div className="forgot-container">
          <div className="forgot-card">
            <div className="forgot-header">
              <Link to="/" className="forgot-logo">
                <img
                  src="/fallacy.png"
                  alt="Logo"
                  className="forgot-logo-image"
                />
                <span className="forgot-site-title">Bone of my fallacy</span>
              </Link>
              <span className="forgot-badge">Admin</span>
            </div>
            <h1 className="forgot-title">パスワードリセット</h1>

            {successMessage ? (
              <div>
                <div className="forgot-success">{successMessage}</div>
                <button
                  type="button"
                  onClick={handleBackToLogin}
                  className="forgot-btn-primary"
                >
                  ログインページに戻る
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <p className="forgot-subtitle">
                  登録されているメールアドレスを入力してください。
                  <br />
                  パスワードリセット用のリンクを送信します。
                </p>

                {emailError && <div className="forgot-error">{emailError}</div>}

                <div className="forgot-field">
                  <label htmlFor="email" className="forgot-label">
                    メールアドレス
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={`forgot-input ${emailError ? 'error' : ''}`}
                    disabled={isSubmitting}
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="forgot-btn-primary"
                >
                  {isSubmitting ? '送信中...' : 'リセットリンクを送信'}
                </button>

                <button
                  type="button"
                  onClick={handleBackToLogin}
                  className="forgot-btn-link"
                >
                  ログインページに戻る
                </button>
              </form>
            )}
          </div>
        </div>
      </div>

      <style>{`
        .forgot-page {
          min-height: 100vh;
          background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }

        .forgot-container {
          width: 100%;
          max-width: 440px;
        }

        .forgot-card {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 16px;
          padding: 40px;
          box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06);
        }

        .forgot-header {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          margin-bottom: 32px;
        }

        .forgot-logo {
          display: flex;
          align-items: center;
        }

        .forgot-logo-image {
          height: 40px;
          width: auto;
          margin-right: 12px;
        }

        .forgot-site-title {
          font-family: 'Caveat', cursive;
          font-size: 1.5rem;
          font-weight: 600;
          color: #1f2937;
          letter-spacing: 0.02em;
        }

        .forgot-badge {
          background: #2D2A5A;
          color: white;
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .forgot-title {
          font-size: 1.5rem;
          font-weight: 700;
          color: #2D2A5A;
          text-align: center;
          margin: 0 0 16px 0;
        }

        .forgot-subtitle {
          font-size: 0.95rem;
          color: #6b7280;
          text-align: center;
          margin: 0 0 24px 0;
          line-height: 1.6;
        }

        .forgot-field {
          margin-bottom: 20px;
        }

        .forgot-label {
          display: block;
          font-size: 0.875rem;
          font-weight: 500;
          color: #374151;
          margin-bottom: 6px;
        }

        .forgot-input {
          width: 100%;
          padding: 12px 16px;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          font-size: 0.95rem;
          background: white;
          transition: all 0.2s ease;
          box-sizing: border-box;
        }

        .forgot-input:focus {
          outline: none;
          border-color: #9ca3af;
          box-shadow: 0 0 0 3px rgba(156, 163, 175, 0.1);
        }

        .forgot-input.error {
          border-color: #dc2626;
        }

        .forgot-input:disabled {
          background: #f9fafb;
          color: #6b7280;
        }

        .forgot-error {
          background: #fef2f2;
          border: 1px solid #fecaca;
          color: #991b1b;
          padding: 12px 16px;
          border-radius: 10px;
          margin-bottom: 20px;
          font-size: 0.875rem;
        }

        .forgot-success {
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          color: #166534;
          padding: 16px;
          border-radius: 10px;
          margin-bottom: 20px;
          font-size: 0.95rem;
          text-align: center;
        }

        .forgot-btn-primary {
          width: 100%;
          padding: 12px 20px;
          background: #2D2A5A;
          color: white;
          border: none;
          border-radius: 10px;
          font-size: 0.95rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          margin-bottom: 16px;
        }

        .forgot-btn-primary:hover {
          background: #3d3a6a;
        }

        .forgot-btn-primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .forgot-btn-link {
          width: 100%;
          padding: 8px 16px;
          background: transparent;
          color: #6b7280;
          border: none;
          font-size: 0.875rem;
          cursor: pointer;
          transition: color 0.2s ease;
        }

        .forgot-btn-link:hover {
          color: #2D2A5A;
        }

        @media (max-width: 480px) {
          .forgot-card {
            padding: 32px 24px;
          }

          .forgot-logo-image {
            height: 40px;
          }

          .forgot-title {
            font-size: 1.25rem;
          }
        }
      `}</style>
    </>
  );
};

export default ForgotPasswordPage;
