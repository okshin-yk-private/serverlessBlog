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
 * セキュアなトークンストレージ
 *
 * セキュリティ上の考慮:
 * - メモリ内にトークンを保持（XSS攻撃時の窃取リスクを軽減）
 * - sessionStorageをフォールバックとして使用（ブラウザを閉じると削除される）
 * - localStorageは使用しない（永続化によるリスク回避）
 */

// メモリ内トークンストレージ（XSS攻撃時の直接アクセスを防ぐ）
let inMemoryToken: string | null = null;

// sessionStorageのキー
const SESSION_TOKEN_KEY = 'auth_session_token';

/**
 * 認証トークンを保存
 * - メモリ内に保存（プライマリ）
 * - sessionStorageに保存（ページリロード時のフォールバック）
 */
export const saveAuthToken = (token: string): void => {
  inMemoryToken = token;
  try {
    // sessionStorageはブラウザを閉じると削除されるため、localStorageより安全
    sessionStorage.setItem(SESSION_TOKEN_KEY, token);
  } catch {
    // sessionStorageが使えない場合はメモリのみで動作
    console.warn('sessionStorage is not available, using memory-only storage');
  }
};

/**
 * 認証トークンを取得
 * - まずメモリから取得を試みる
 * - メモリにない場合はsessionStorageからリストア
 */
export const getAuthToken = (): string | null => {
  // メモリ内にトークンがあればそれを返す
  if (inMemoryToken) {
    return inMemoryToken;
  }

  // ページリロード時などはsessionStorageからリストア
  try {
    const sessionToken = sessionStorage.getItem(SESSION_TOKEN_KEY);
    if (sessionToken) {
      // メモリにも復元
      inMemoryToken = sessionToken;
      return sessionToken;
    }
  } catch {
    // sessionStorageにアクセスできない場合は無視
  }

  return null;
};

/**
 * 認証トークンを削除
 */
export const removeAuthToken = (): void => {
  inMemoryToken = null;
  try {
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
  } catch {
    // sessionStorageにアクセスできない場合は無視
  }
};

/**
 * localStorageからの移行処理
 * 既存のlocalStorageトークンをsessionStorageに移行し、localStorageから削除
 */
export const migrateFromLocalStorage = (): void => {
  try {
    const legacyToken = localStorage.getItem('auth_token');
    if (legacyToken) {
      // 既存トークンをsessionStorageに移行
      saveAuthToken(legacyToken);
      // localStorageから削除（セキュリティ向上）
      localStorage.removeItem('auth_token');
    }
  } catch {
    // ストレージにアクセスできない場合は無視
  }
};

/**
 * JWTペイロードの型定義
 */
interface JWTPayload {
  exp?: number;
  iat?: number;
  sub?: string;
  email?: string;
  [key: string]: unknown;
}

/**
 * JWTトークンをデコード
 */
export const decodeToken = (token: string): JWTPayload | null => {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const payload = parts[1];
    const decoded = JSON.parse(atob(payload)) as JWTPayload;
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
