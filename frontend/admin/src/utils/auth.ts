/**
 * メールアドレスのバリデーション
 */
export const validateEmail = (email: string): string | null => {
  const trimmedEmail = email.trim();

  if (!trimmedEmail) {
    return 'メールアドレスは必須です';
  }

  // 簡易的なメールアドレス形式のチェック
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmedEmail)) {
    return '有効なメールアドレスを入力してください';
  }

  return null;
};

/**
 * パスワードのバリデーション
 */
export const validatePassword = (password: string): string | null => {
  const trimmedPassword = password.trim();

  if (!trimmedPassword) {
    return 'パスワードは必須です';
  }

  if (trimmedPassword.length < 8) {
    return 'パスワードは8文字以上で入力してください';
  }

  return null;
};

/**
 * 認証トークンをlocalStorageに保存
 */
export const saveAuthToken = (token: string): void => {
  localStorage.setItem('auth_token', token);
};

/**
 * 認証トークンをlocalStorageから取得
 */
export const getAuthToken = (): string | null => {
  return localStorage.getItem('auth_token');
};

/**
 * 認証トークンをlocalStorageから削除
 */
export const removeAuthToken = (): void => {
  localStorage.removeItem('auth_token');
};

/**
 * JWTトークンをデコード
 */
export const decodeToken = (token: string): any | null => {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const payload = parts[1];
    const decoded = JSON.parse(atob(payload));
    return decoded;
  } catch {
    return null;
  }
};

/**
 * トークンの有効期限をチェック
 */
export const isTokenExpired = (token: string): boolean => {
  const decoded = decodeToken(token);

  if (!decoded || !decoded.exp) {
    return true;
  }

  const currentTime = Math.floor(Date.now() / 1000);
  return decoded.exp < currentTime;
};
