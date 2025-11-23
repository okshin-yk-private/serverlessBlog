import { createContext } from 'react';

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
export interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

/**
 * 認証コンテキスト
 * useAuthフックを通じてのみアクセスすべき
 */
export const AuthContext = createContext<AuthContextType | undefined>(
  undefined
);
