import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { AuthProvider } from './AuthContext';
import { useAuth } from '../hooks/useAuth';
import * as amplifyAuth from 'aws-amplify/auth';

// Amplifyのモック
vi.mock('aws-amplify/auth', () => ({
  signIn: vi.fn(),
  signOut: vi.fn(),
  getCurrentUser: vi.fn(),
  fetchAuthSession: vi.fn(),
}));

// localStorageのモック
const localStorageMock = (() => {
  let store: { [key: string]: string } = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

describe('AuthContext', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('useAuthはAuthProvider外で使用するとエラーを投げる', () => {
    // エラーをキャッチして検証
    expect(() => {
      renderHook(() => useAuth());
    }).toThrow('useAuth must be used within an AuthProvider');
  });

  it('初期状態では未認証', async () => {
    vi.mocked(amplifyAuth.getCurrentUser).mockRejectedValue(
      new Error('Not authenticated')
    );

    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
  });

  it('有効なトークンがある場合は自動的に認証状態になる', async () => {
    // 有効なトークンを設定
    const futureTimestamp = Math.floor(Date.now() / 1000) + 3600;
    const payload = {
      sub: 'user-123',
      email: 'test@example.com',
      exp: futureTimestamp,
    };
    const encodedPayload = btoa(JSON.stringify(payload));
    const token = `header.${encodedPayload}.signature`;
    localStorage.setItem('auth_token', token);

    // Amplify getCurrentUser のモック
    vi.mocked(amplifyAuth.getCurrentUser).mockResolvedValue({
      userId: 'user-123',
      username: 'test@example.com',
      signInDetails: {
        loginId: 'test@example.com',
      },
    } as any);

    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user).toEqual({
      id: 'user-123',
      email: 'test@example.com',
    });
  });

  it('期限切れトークンの場合は未認証状態になる', async () => {
    // 期限切れトークンを設定
    const pastTimestamp = Math.floor(Date.now() / 1000) - 3600;
    const payload = {
      sub: 'user-123',
      email: 'test@example.com',
      exp: pastTimestamp,
    };
    const encodedPayload = btoa(JSON.stringify(payload));
    const token = `header.${encodedPayload}.signature`;
    localStorage.setItem('auth_token', token);

    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(localStorage.getItem('auth_token')).toBeNull();
  });

  it('ログインが成功するとユーザー情報が設定される', async () => {
    vi.mocked(amplifyAuth.signIn).mockResolvedValue({
      isSignedIn: true,
      nextStep: { signInStep: 'DONE' },
    } as any);

    vi.mocked(amplifyAuth.fetchAuthSession).mockResolvedValue({
      tokens: {
        idToken: {
          toString: () => 'mock-jwt-token',
        },
      },
    } as any);

    vi.mocked(amplifyAuth.getCurrentUser).mockResolvedValue({
      userId: 'user-123',
      username: 'test@example.com',
      signInDetails: {
        loginId: 'test@example.com',
      },
    } as any);

    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.login('test@example.com', 'password123');
    });

    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(true);
    });

    expect(result.current.user).toEqual({
      id: 'user-123',
      email: 'test@example.com',
    });
    expect(localStorage.getItem('auth_token')).toBe('mock-jwt-token');
  });

  it('ログアウトするとユーザー情報がクリアされる', async () => {
    // 初期状態でログイン済み
    const futureTimestamp = Math.floor(Date.now() / 1000) + 3600;
    const payload = {
      sub: 'user-123',
      email: 'test@example.com',
      exp: futureTimestamp,
    };
    const encodedPayload = btoa(JSON.stringify(payload));
    const token = `header.${encodedPayload}.signature`;
    localStorage.setItem('auth_token', token);

    vi.mocked(amplifyAuth.getCurrentUser).mockResolvedValue({
      userId: 'user-123',
      username: 'test@example.com',
      signInDetails: {
        loginId: 'test@example.com',
      },
    } as any);

    vi.mocked(amplifyAuth.signOut).mockResolvedValue(undefined as any);

    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.isAuthenticated).toBe(true);
    });

    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(localStorage.getItem('auth_token')).toBeNull();
  });

  it('ログインが失敗するとエラーをスローする', async () => {
    vi.mocked(amplifyAuth.signIn).mockRejectedValue(
      new Error('Invalid credentials')
    );

    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await expect(
      act(async () => {
        await result.current.login('test@example.com', 'wrong-password');
      })
    ).rejects.toThrow('Invalid credentials');

    expect(result.current.isAuthenticated).toBe(false);
  });

  it('ログアウトが失敗してもエラーをスローする', async () => {
    vi.mocked(amplifyAuth.signOut).mockRejectedValue(
      new Error('Signout failed')
    );

    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await expect(
      act(async () => {
        await result.current.logout();
      })
    ).rejects.toThrow('Signout failed');
  });

  it('認証状態チェック時にエラーが発生した場合、ユーザーをクリアする', async () => {
    // console.errorをモック
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    // 有効な形式のJWTトークンを作成（期限内）
    const futureTimestamp = Math.floor(Date.now() / 1000) + 3600;
    const payload = {
      sub: 'user-123',
      email: 'test@example.com',
      exp: futureTimestamp,
    };
    const encodedPayload = btoa(JSON.stringify(payload));
    const token = `header.${encodedPayload}.signature`;
    localStorage.setItem('auth_token', token);

    // getCurrentUserがエラーをスローするようにモック
    const authError = new Error('Auth check failed');
    vi.mocked(amplifyAuth.getCurrentUser).mockRejectedValue(authError);

    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // console.errorが呼ばれたことを確認
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '認証状態の確認に失敗しました:',
      authError
    );

    // エラーが発生した場合、ユーザーはnullになり、トークンがクリアされる
    expect(result.current.user).toBeNull();
    expect(localStorage.getItem('auth_token')).toBeNull();

    // モックをクリーンアップ
    consoleErrorSpy.mockRestore();
  });

  it('signInDetailsがundefinedの場合でも認証状態チェックが成功する', async () => {
    // 有効なトークンを設定
    const futureTimestamp = Math.floor(Date.now() / 1000) + 3600;
    const payload = {
      sub: 'user-123',
      email: 'test@example.com',
      exp: futureTimestamp,
    };
    const encodedPayload = btoa(JSON.stringify(payload));
    const token = `header.${encodedPayload}.signature`;
    localStorage.setItem('auth_token', token);

    // signInDetailsがundefinedのgetCurrentUserモック
    vi.mocked(amplifyAuth.getCurrentUser).mockResolvedValue({
      userId: 'user-123',
      username: 'test@example.com',
      signInDetails: undefined,
    } as any);

    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user).toEqual({
      id: 'user-123',
      email: '', // signInDetailsがundefinedなので空文字列
    });
  });

  it('loginIdが空文字列の場合でもログインが成功する', async () => {
    vi.mocked(amplifyAuth.signIn).mockResolvedValue({
      isSignedIn: true,
      nextStep: { signInStep: 'DONE' },
    } as any);

    vi.mocked(amplifyAuth.fetchAuthSession).mockResolvedValue({
      tokens: {
        idToken: {
          toString: () => 'mock-jwt-token',
        },
      },
    } as any);

    // loginIdが空文字列のgetCurrentUserモック
    vi.mocked(amplifyAuth.getCurrentUser).mockResolvedValue({
      userId: 'user-123',
      username: 'test@example.com',
      signInDetails: {
        loginId: '',
      },
    } as any);

    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.login('test@example.com', 'password123');
    });

    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(true);
    });

    expect(result.current.user).toEqual({
      id: 'user-123',
      email: 'test@example.com', // loginIdが空なのでフォールバック
    });
  });

  it('signInDetailsがundefinedの場合でもログインが成功する', async () => {
    vi.mocked(amplifyAuth.signIn).mockResolvedValue({
      isSignedIn: true,
      nextStep: { signInStep: 'DONE' },
    } as any);

    vi.mocked(amplifyAuth.fetchAuthSession).mockResolvedValue({
      tokens: {
        idToken: {
          toString: () => 'mock-jwt-token',
        },
      },
    } as any);

    // signInDetailsがundefinedのgetCurrentUserモック
    vi.mocked(amplifyAuth.getCurrentUser).mockResolvedValue({
      userId: 'user-123',
      username: 'test@example.com',
      signInDetails: undefined,
    } as any);

    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.login('test@example.com', 'password123');
    });

    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(true);
    });

    expect(result.current.user).toEqual({
      id: 'user-123',
      email: 'test@example.com', // signInDetailsがundefinedなのでフォールバック
    });
  });
});
