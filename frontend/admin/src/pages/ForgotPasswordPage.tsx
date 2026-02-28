import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { resetPassword, confirmResetPassword } from 'aws-amplify/auth';
import { validateEmail, validatePassword } from '../utils/auth';

type Step = 'email' | 'confirm' | 'success';

const ForgotPasswordPage = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [confirmationCode, setConfirmationCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmPasswordError, setConfirmPasswordError] = useState<
    string | null
  >(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);

  // ステップ1: メールアドレス送信
  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);

    // バリデーション
    const emailValidation = validateEmail(email);
    setEmailError(emailValidation);

    if (emailValidation) {
      return;
    }

    setIsSubmitting(true);
    try {
      // E2Eテスト時はモック動作
      if (import.meta.env.VITE_ENABLE_MSW_MOCK === 'true') {
        await new Promise((resolve) => setTimeout(resolve, 500));
        setStep('confirm');
        setIsSubmitting(false);
        return;
      }

      // Cognitoにパスワードリセットリクエストを送信
      const output = await resetPassword({ username: email });

      // 次のステップを確認
      if (
        output.nextStep.resetPasswordStep === 'CONFIRM_RESET_PASSWORD_WITH_CODE'
      ) {
        setStep('confirm');
      } else if (output.nextStep.resetPasswordStep === 'DONE') {
        // すでに完了している場合（通常はない）
        setStep('success');
      }
    } catch (err) {
      console.error('パスワードリセットエラー:', err);

      // エラーメッセージを設定
      if (err instanceof Error) {
        if (err.name === 'UserNotFoundException') {
          setGeneralError('このメールアドレスは登録されていません。');
        } else if (err.name === 'LimitExceededException') {
          setGeneralError(
            'リクエスト回数の上限に達しました。しばらく時間をおいてからお試しください。'
          );
        } else if (err.name === 'InvalidParameterException') {
          setGeneralError(
            '無効なパラメータです。メールアドレスを確認してください。'
          );
        } else {
          setGeneralError('パスワードリセットのリクエストに失敗しました。');
        }
      } else {
        setGeneralError('パスワードリセットのリクエストに失敗しました。');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // ステップ2: 確認コードと新パスワードで確定
  const handleConfirmSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);

    // バリデーション
    let hasError = false;

    if (!confirmationCode.trim()) {
      setCodeError('確認コードを入力してください。');
      hasError = true;
    } else if (!/^\d{6}$/.test(confirmationCode.trim())) {
      setCodeError('確認コードは6桁の数字で入力してください。');
      hasError = true;
    } else {
      setCodeError(null);
    }

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
      // E2Eテスト時はモック動作
      if (import.meta.env.VITE_ENABLE_MSW_MOCK === 'true') {
        await new Promise((resolve) => setTimeout(resolve, 500));
        setStep('success');
        setIsSubmitting(false);
        return;
      }

      // Cognitoでパスワードリセットを確定
      await confirmResetPassword({
        username: email,
        confirmationCode: confirmationCode.trim(),
        newPassword,
      });

      setStep('success');
    } catch (err) {
      console.error('パスワードリセット確定エラー:', err);

      if (err instanceof Error) {
        if (err.name === 'CodeMismatchException') {
          setGeneralError('確認コードが正しくありません。');
        } else if (err.name === 'ExpiredCodeException') {
          setGeneralError(
            '確認コードの有効期限が切れました。最初からやり直してください。'
          );
        } else if (err.name === 'InvalidPasswordException') {
          setGeneralError(
            'パスワードが要件を満たしていません。8文字以上で、大文字・小文字・数字を含めてください。'
          );
        } else if (err.name === 'LimitExceededException') {
          setGeneralError(
            'リクエスト回数の上限に達しました。しばらく時間をおいてからお試しください。'
          );
        } else {
          setGeneralError('パスワードのリセットに失敗しました。');
        }
      } else {
        setGeneralError('パスワードのリセットに失敗しました。');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBackToLogin = () => {
    navigate('/login');
  };

  const handleBackToEmail = () => {
    setStep('email');
    setConfirmationCode('');
    setNewPassword('');
    setConfirmPassword('');
    setCodeError(null);
    setPasswordError(null);
    setConfirmPasswordError(null);
    setGeneralError(null);
  };

  const renderEmailStep = () => (
    <form onSubmit={handleEmailSubmit}>
      <p className="forgot-subtitle">
        登録されているメールアドレスを入力してください。
        <br />
        パスワードリセット用の確認コードを送信します。
      </p>

      {generalError && <div className="forgot-error">{generalError}</div>}
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
          autoComplete="email"
        />
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="forgot-btn-primary"
      >
        {isSubmitting ? '送信中...' : '確認コードを送信'}
      </button>

      <button
        type="button"
        onClick={handleBackToLogin}
        className="forgot-btn-link"
      >
        ログインページに戻る
      </button>
    </form>
  );

  const renderConfirmStep = () => (
    <form onSubmit={handleConfirmSubmit}>
      <p className="forgot-subtitle">
        {email} に確認コードを送信しました。
        <br />
        確認コードと新しいパスワードを入力してください。
      </p>

      {generalError && <div className="forgot-error">{generalError}</div>}

      <div className="forgot-field">
        <label htmlFor="confirmationCode" className="forgot-label">
          確認コード（6桁）
        </label>
        <input
          id="confirmationCode"
          type="text"
          value={confirmationCode}
          onChange={(e) => setConfirmationCode(e.target.value)}
          className={`forgot-input ${codeError ? 'error' : ''}`}
          disabled={isSubmitting}
          maxLength={6}
          placeholder="123456"
          autoComplete="one-time-code"
        />
        {codeError && <div className="forgot-field-error">{codeError}</div>}
      </div>

      <div className="forgot-field">
        <label htmlFor="newPassword" className="forgot-label">
          新しいパスワード
        </label>
        <input
          id="newPassword"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className={`forgot-input ${passwordError ? 'error' : ''}`}
          disabled={isSubmitting}
          autoComplete="new-password"
        />
        {passwordError && (
          <div className="forgot-field-error">{passwordError}</div>
        )}
      </div>

      <div className="forgot-field">
        <label htmlFor="confirmPassword" className="forgot-label">
          新しいパスワード（確認）
        </label>
        <input
          id="confirmPassword"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className={`forgot-input ${confirmPasswordError ? 'error' : ''}`}
          disabled={isSubmitting}
          autoComplete="new-password"
        />
        {confirmPasswordError && (
          <div className="forgot-field-error">{confirmPasswordError}</div>
        )}
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="forgot-btn-primary"
      >
        {isSubmitting ? 'リセット中...' : 'パスワードをリセット'}
      </button>

      <button
        type="button"
        onClick={handleBackToEmail}
        className="forgot-btn-link"
      >
        メールアドレスを変更する
      </button>
    </form>
  );

  const renderSuccessStep = () => (
    <div>
      <div className="forgot-success">
        パスワードのリセットが完了しました。
        <br />
        新しいパスワードでログインしてください。
      </div>
      <button
        type="button"
        onClick={handleBackToLogin}
        className="forgot-btn-primary"
      >
        ログインページに戻る
      </button>
    </div>
  );

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

            {step === 'email' && renderEmailStep()}
            {step === 'confirm' && renderConfirmStep()}
            {step === 'success' && renderSuccessStep()}
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

        .forgot-field-error {
          color: #dc2626;
          font-size: 0.8rem;
          margin-top: 6px;
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
          line-height: 1.6;
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
