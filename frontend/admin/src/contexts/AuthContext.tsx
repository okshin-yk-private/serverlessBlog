import React, {
  createContext,
  useState,
  useEffect,
  type ReactNode,
} from 'react';
import {
  signIn,
  signOut,
  getCurrentUser,
  fetchAuthSession,
  confirmSignIn,
} from 'aws-amplify/auth';
import {
  getAuthToken,
  saveAuthToken,
  removeAuthToken,
  isTokenExpired,
} from '../utils/auth';
import { loginAPI } from '../api/auth';

/**
 * ユーザー情報の型定義
 */
interface User {
  id: string;
  email: string;
}

/**
 * AuthContextの型定義
 */
/**
 * ログイン結果の型定義
 */
export interface LoginResult {
  success: boolean;
  requiresNewPassword: boolean;
}

/**
 * AuthContextの型定義
 */
export interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  requiresNewPassword: boolean;
  pendingEmail: string | null;
  login: (email: string, password: string) => Promise<LoginResult>;
  confirmNewPassword: (newPassword: string) => Promise<void>;
  cancelNewPassword: () => void;
  logout: () => Promise<void>;
}

/**
 * 認証コンテキスト
 * useAuthフックを通じてのみアクセスすべき
 */
export const AuthContext = createContext<AuthContextType | undefined>(
  undefined
);

/**
 * AuthProviderのプロパティ型定義
 */
interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [requiresNewPassword, setRequiresNewPassword] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  // 初期化時に既存のセッションをチェック
  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      // E2Eテスト時はAmplifyを使用せず、トークンベースの認証のみ
      if (import.meta.env.VITE_ENABLE_MSW_MOCK === 'true') {
        const token = getAuthToken();
        if (token && !isTokenExpired(token)) {
          // E2Eテスト時はモックユーザー情報を設定
          setUser({
            id: 'test-user-id',
            email: 'admin@example.com',
          });
        } else {
          removeAuthToken();
          setUser(null);
        }
        setIsLoading(false);
        return;
      }

      const token = getAuthToken();

      // トークンが存在し、有効期限内であれば
      if (token && !isTokenExpired(token)) {
        // Cognitoから現在のユーザー情報を取得
        const currentUser = await getCurrentUser();
        setUser({
          id: currentUser.userId,
          email: currentUser.signInDetails?.loginId || '',
        });
      } else {
        // トークンが無効または存在しない場合はクリア
        removeAuthToken();
        setUser(null);
      }
    } catch (error) {
      console.error('認証状態の確認に失敗しました:', error);
      removeAuthToken();
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (
    email: string,
    password: string
  ): Promise<LoginResult> => {
    try {
      // E2Eテスト時はMSWモックを使用
      if (import.meta.env.VITE_ENABLE_MSW_MOCK === 'true') {
        // APIを呼び出してMSWがレスポンスを返すようにする
        const response = await loginAPI(email, password);
        saveAuthToken(response.token);
        setUser(response.user);
        return { success: true, requiresNewPassword: false };
      }

      // 既存のセッションがある場合はサインアウトしてからサインイン
      try {
        const currentUser = await getCurrentUser();
        if (currentUser) {
          await signOut();
        }
      } catch {
        // ユーザーがいない場合は無視
      }

      // Cognitoでサインイン
      const signInResult = await signIn({ username: email, password });

      // 初回ログイン時のパスワード変更が必要な場合
      if (
        signInResult.nextStep?.signInStep ===
        'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED'
      ) {
        // 新パスワード必要状態を設定
        setRequiresNewPassword(true);
        setPendingEmail(email);
        return { success: true, requiresNewPassword: true };
      }

      if (!signInResult.isSignedIn) {
        throw new Error('ログインに失敗しました');
      }

      // セッション情報を取得してログイン完了
      await completeSignIn(email);
      return { success: true, requiresNewPassword: false };
    } catch (error) {
      console.error('ログインに失敗しました:', error);
      throw error;
    }
  };

  const confirmNewPassword = async (newPassword: string) => {
    try {
      // E2Eテスト時はモック動作
      if (import.meta.env.VITE_ENABLE_MSW_MOCK === 'true') {
        await new Promise((resolve) => setTimeout(resolve, 500));
        setRequiresNewPassword(false);
        setUser({
          id: 'test-user-id',
          email: pendingEmail || 'admin@example.com',
        });
        saveAuthToken('mock-token-after-password-change');
        setPendingEmail(null);
        return;
      }

      // Cognitoで新パスワードを確認
      const confirmResult = await confirmSignIn({
        challengeResponse: newPassword,
      });

      if (!confirmResult.isSignedIn) {
        throw new Error('パスワード変更に失敗しました');
      }

      // セッション情報を取得してログイン完了
      await completeSignIn(pendingEmail || '');

      // 状態をリセット
      setRequiresNewPassword(false);
      setPendingEmail(null);
    } catch (error) {
      console.error('パスワード変更に失敗しました:', error);
      throw error;
    }
  };

  const cancelNewPassword = () => {
    setRequiresNewPassword(false);
    setPendingEmail(null);
    // サインイン状態をクリア
    signOut().catch(() => {
      // エラーは無視
    });
  };

  const completeSignIn = async (email: string) => {
    // セッション情報を取得
    const session = await fetchAuthSession();
    const idToken = session.tokens?.idToken?.toString();

    if (idToken) {
      // トークンを保存
      saveAuthToken(idToken);

      // ユーザー情報を取得
      const currentUser = await getCurrentUser();
      setUser({
        id: currentUser.userId,
        email: currentUser.signInDetails?.loginId || email,
      });
    }
  };

  const logout = async () => {
    try {
      // E2Eテスト時はAmplifyを使用せず、ローカル状態のみクリア
      if (import.meta.env.VITE_ENABLE_MSW_MOCK === 'true') {
        removeAuthToken();
        setUser(null);
        return;
      }

      // Cognitoからサインアウト
      await signOut();

      // ローカルの状態をクリア
      removeAuthToken();
      setUser(null);
    } catch (error) {
      console.error('ログアウトに失敗しました:', error);
      throw error;
    }
  };

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    requiresNewPassword,
    pendingEmail,
    login,
    confirmNewPassword,
    cancelNewPassword,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
