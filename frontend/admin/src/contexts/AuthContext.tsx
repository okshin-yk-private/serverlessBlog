import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { signIn, signOut, getCurrentUser, fetchAuthSession } from 'aws-amplify/auth';
import { getAuthToken, saveAuthToken, removeAuthToken, isTokenExpired } from '../utils/auth';

interface User {
  id: string;
  email: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

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
      // Cognitoでサインイン
      const { isSignedIn } = await signIn({ username: email, password });

      if (isSignedIn) {
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
      }
    } catch (error) {
      console.error('ログインに失敗しました:', error);
      throw error;
    }
  };

  const logout = async () => {
    try {
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

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
