import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
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
    navigate('/');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <h1 className="text-2xl font-bold mb-6 text-center">
          パスワードリセット
        </h1>

        {successMessage ? (
          <div>
            <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
              {successMessage}
            </div>
            <Button
              type="button"
              variant="primary"
              onClick={handleBackToLogin}
              className="w-full"
            >
              ログインページに戻る
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm text-gray-600 mb-4">
              登録されているメールアドレスを入力してください。パスワードリセット用のリンクを送信します。
            </p>

            {emailError && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
                {emailError}
              </div>
            )}

            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                メールアドレス
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  emailError ? 'border-red-500' : 'border-gray-300'
                }`}
                disabled={isSubmitting}
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              disabled={isSubmitting}
              className="w-full"
            >
              {isSubmitting ? '送信中...' : 'リセットリンクを送信'}
            </Button>

            <button
              type="button"
              onClick={handleBackToLogin}
              className="w-full text-sm text-blue-600 hover:text-blue-800 text-center"
            >
              ログインページに戻る
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
