import React, { useState, useEffect, type ReactNode } from 'react';
import {
  signIn,
  signOut,
  getCurrentUser,
  fetchAuthSession,
} from 'aws-amplify/auth';
import {
  getAuthToken,
  saveAuthToken,
  removeAuthToken,
  isTokenExpired,
} from '../utils/auth';
import { loginAPI } from '../api/auth';
import { AuthContext, type AuthContextType } from './authContext';

/**
 * ユーザー情報の型定義
 */
interface User {
  id: string;
  email: string;
}

/**
 * AuthProviderのプロパティ型定義
 */
interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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

  const login = async (email: string, password: string) => {
    try {
      // E2Eテスト時はMSWモックを使用
      if (import.meta.env.VITE_ENABLE_MSW_MOCK === 'true') {
        // APIを呼び出してMSWがレスポンスを返すようにする
        const response = await loginAPI(email, password);
        saveAuthToken(response.token);
        setUser(response.user);
        return;
      }

      // Cognitoでサインイン
      const signInResult = await signIn({ username: email, password });

      // 初回ログイン時のパスワード変更が必要な場合
      if (
        signInResult.nextStep?.signInStep ===
        'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED'
      ) {
        // 新しいパスワードとして同じパスワードを使用して確認
        // 注意: 本番環境では、ユーザーに新しいパスワードを入力させるUIを用意することを推奨
        const { confirmSignIn } = await import('aws-amplify/auth');
        const confirmResult = await confirmSignIn({
          challengeResponse: password,
        });

        if (!confirmResult.isSignedIn) {
          throw new Error('パスワード確認に失敗しました');
        }
      } else if (!signInResult.isSignedIn) {
        throw new Error('ログインに失敗しました');
      }

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
    } catch (error) {
      console.error('ログインに失敗しました:', error);
      throw error;
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
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
