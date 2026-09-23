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
  type SignInOutput,
} from 'aws-amplify/auth';
import {
  getAuthToken,
  saveAuthToken,
  removeAuthToken,
  isTokenExpired,
  migrateFromLocalStorage,
} from '../utils/auth';
import {
  loginAPI,
  confirmMockSignIn,
  type MockSignInResponse,
} from '../api/auth';
import { AUTH_SESSION_EXPIRED_EVENT } from '../api/client';

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
  requiresTotp?: boolean;
}

export type TotpChallenge =
  { kind: 'code' } | { kind: 'setup'; sharedSecret: string; setupUri: string };

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
  confirmNewPassword: (newPassword: string) => Promise<LoginResult>;
  totpChallenge: TotpChallenge | null;
  confirmTotp: (code: string) => Promise<LoginResult>;
  cancelNewPassword: () => void;
  logout: () => Promise<void>;
}

/**
 * 認証コンテキスト
 * useAuthフックを通じてのみアクセスすべき
 */
// eslint-disable-next-line react-refresh/only-export-components
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

  const [totpChallenge, setTotpChallenge] = useState<TotpChallenge | null>(
    null
  );

  // 初期化時に既存のセッションをチェック
  useEffect(() => {
    checkAuthStatus();
  }, []);

  // APIクライアントがトークン再取得に失敗した場合（セッション失効）は
  // 認証状態をクリアし、AuthGuard 経由でログインページへ誘導する
  useEffect(() => {
    const handleSessionExpired = () => {
      setUser(null);
    };
    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () => {
      window.removeEventListener(
        AUTH_SESSION_EXPIRED_EVENT,
        handleSessionExpired
      );
    };
  }, []);

  const checkAuthStatus = async () => {
    try {
      // 既存のlocalStorageトークンをsessionStorageに移行（セキュリティ向上）
      migrateFromLocalStorage();

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

  const resetChallenge = () => {
    setRequiresNewPassword(false);
    setTotpChallenge(null);
    setPendingEmail(null);
  };

  // signIn and confirmSignIn can both return another challenge.
  const handleSignInResult = async (
    result: SignInOutput,
    email: string
  ): Promise<LoginResult> => {
    if (result.isSignedIn) {
      await completeSignIn(email);
      resetChallenge();
      return { success: true, requiresNewPassword: false };
    }
    const step = result.nextStep;
    setRequiresNewPassword(false);
    setTotpChallenge(null);
    setPendingEmail(email);
    switch (step.signInStep) {
      case 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED':
        setRequiresNewPassword(true);
        return { success: true, requiresNewPassword: true };
      case 'CONFIRM_SIGN_IN_WITH_TOTP_CODE':
        setTotpChallenge({ kind: 'code' });
        return {
          success: true,
          requiresNewPassword: false,
          requiresTotp: true,
        };
      case 'CONTINUE_SIGN_IN_WITH_TOTP_SETUP':
        setTotpChallenge({
          kind: 'setup',
          sharedSecret: step.totpSetupDetails.sharedSecret,
          setupUri: step.totpSetupDetails
            .getSetupUri('Bone of my fallacy', email)
            .toString(),
        });
        return {
          success: true,
          requiresNewPassword: false,
          requiresTotp: true,
        };
      default:
        resetChallenge();
        throw new Error('ログインに失敗しました');
    }
  };

  // MSW-only responses enter the same challenge state machine as Amplify.
  const handleMockResult = async (
    response: MockSignInResponse,
    email: string
  ): Promise<LoginResult> => {
    if ('token' in response) {
      saveAuthToken(response.token);
      setUser(response.user);
      resetChallenge();
      return { success: true, requiresNewPassword: false };
    }
    if (response.step === 'setup') {
      return handleSignInResult(
        {
          isSignedIn: false,
          nextStep: {
            signInStep: 'CONTINUE_SIGN_IN_WITH_TOTP_SETUP',
            totpSetupDetails: {
              sharedSecret: response.sharedSecret,
              getSetupUri: () => new URL(response.setupUri),
            },
          },
        },
        email
      );
    }
    return handleSignInResult(
      {
        isSignedIn: false,
        nextStep:
          response.step === 'password'
            ? {
                signInStep: 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED',
                missingAttributes: [],
              }
            : { signInStep: 'CONFIRM_SIGN_IN_WITH_TOTP_CODE' },
      },
      email
    );
  };

  const login = async (
    email: string,
    password: string
  ): Promise<LoginResult> => {
    resetChallenge();
    removeAuthToken();
    setUser(null);
    if (import.meta.env.VITE_ENABLE_MSW_MOCK === 'true') {
      return handleMockResult(await loginAPI(email, password), email);
    }
    try {
      if (await getCurrentUser()) await signOut();
    } catch {
      // No existing session.
    }
    return handleSignInResult(
      await signIn({ username: email, password }),
      email
    );
  };

  const confirmNewPassword = async (
    newPassword: string
  ): Promise<LoginResult> => {
    if (!requiresNewPassword || !pendingEmail)
      throw new Error('ログインからやり直してください。');
    if (import.meta.env.VITE_ENABLE_MSW_MOCK === 'true') {
      return handleMockResult(
        await confirmMockSignIn(pendingEmail, newPassword, 'password'),
        pendingEmail
      );
    }
    return handleSignInResult(
      await confirmSignIn({ challengeResponse: newPassword }),
      pendingEmail
    );
  };

  const confirmTotp = async (code: string): Promise<LoginResult> => {
    if (!totpChallenge || !pendingEmail)
      throw new Error('ログインからやり直してください。');
    if (!/^[0-9]{6}$/.test(code))
      throw new Error('6桁の認証コードを入力してください。');
    if (import.meta.env.VITE_ENABLE_MSW_MOCK === 'true') {
      return handleMockResult(
        await confirmMockSignIn(pendingEmail, code, 'totp'),
        pendingEmail
      );
    }
    return handleSignInResult(
      await confirmSignIn({ challengeResponse: code }),
      pendingEmail
    );
  };

  const cancelNewPassword = () => {
    resetChallenge();
    removeAuthToken();
    setUser(null);
    if (import.meta.env.VITE_ENABLE_MSW_MOCK !== 'true') {
      signOut().catch(() => {});
    }
  };

  const completeSignIn = async (email: string) => {
    // セッション情報を取得
    const session = await fetchAuthSession();
    const idToken = session.tokens?.idToken?.toString();

    if (!idToken)
      throw new Error(
        '認証セッションを取得できませんでした。ログインからやり直してください。'
      );
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
    totpChallenge,
    confirmTotp,
    login,
    confirmNewPassword,
    cancelNewPassword,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
