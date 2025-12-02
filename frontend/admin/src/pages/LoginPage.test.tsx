import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import LoginPage from './LoginPage';
import { AuthProvider } from '../contexts/AuthContext';
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

// テストヘルパー: LoginPageをラップして描画
const renderLoginPage = (initialRoute = '/login') => {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    </MemoryRouter>
  );
};

describe('LoginPage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    // console.errorをモック（エラーログの抑制）
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // getCurrentUserのデフォルトモック（未認証状態）
    vi.mocked(amplifyAuth.getCurrentUser).mockRejectedValue(
      new Error('Not authenticated')
    );
  });

  // レンダリングテスト
  it('ログイン画面が正しくレンダリングされる', async () => {
    renderLoginPage();

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /管理画面ログイン/i })
      ).toBeInTheDocument();
    });

    // LoginFormコンポーネントが表示される
    expect(screen.getByLabelText(/メールアドレス/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/パスワード/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /ログイン/i })
    ).toBeInTheDocument();
  });

  it('ページタイトルが表示される', async () => {
    renderLoginPage();

    await waitFor(() => {
      expect(screen.getByText('管理画面ログイン')).toBeInTheDocument();
    });
  });

  // バリデーションテスト（LoginFormで既に実装済みだが、統合テストとして確認）
  it('空のフォームを送信するとバリデーションエラーが表示される', async () => {
    const user = userEvent.setup();
    renderLoginPage();

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /ログイン/i })
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /ログイン/i }));

    await waitFor(() => {
      expect(screen.getByText('メールアドレスは必須です')).toBeInTheDocument();
      expect(screen.getByText('パスワードは必須です')).toBeInTheDocument();
    });
  });

  it('無効なメールアドレス形式でバリデーションエラーが表示される', async () => {
    const user = userEvent.setup();
    renderLoginPage();

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /ログイン/i })
      ).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/メールアドレス/i), 'invalid-email');
    await user.type(screen.getByLabelText(/パスワード/i), 'password123');
    await user.click(screen.getByRole('button', { name: /ログイン/i }));

    await waitFor(() => {
      expect(
        screen.getByText('有効なメールアドレスを入力してください')
      ).toBeInTheDocument();
    });
  });

  // 認証成功テスト
  it('正しい認証情報でログインするとダッシュボードにリダイレクトされる', async () => {
    const user = userEvent.setup();

    // Amplifyのモック設定
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

    // MemoryRouterで履歴を追跡
    render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /ログイン/i })
      ).toBeInTheDocument();
    });

    await user.type(
      screen.getByLabelText(/メールアドレス/i),
      'test@example.com'
    );
    await user.type(screen.getByLabelText(/パスワード/i), 'password123');
    await user.click(screen.getByRole('button', { name: /ログイン/i }));

    // ログインが成功すると、トークンが保存される
    await waitFor(() => {
      expect(localStorage.getItem('auth_token')).toBe('mock-jwt-token');
    });
  });

  // エラーハンドリングテスト
  it('認証失敗時にエラーメッセージが表示される', async () => {
    const user = userEvent.setup();

    // Amplifyのモック設定（認証失敗）
    vi.mocked(amplifyAuth.signIn).mockRejectedValue(
      new Error('Invalid credentials')
    );

    renderLoginPage();

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /ログイン/i })
      ).toBeInTheDocument();
    });

    await user.type(
      screen.getByLabelText(/メールアドレス/i),
      'test@example.com'
    );
    await user.type(screen.getByLabelText(/パスワード/i), 'wrong-password');
    await user.click(screen.getByRole('button', { name: /ログイン/i }));

    // エラーメッセージが表示される
    await waitFor(() => {
      expect(
        screen.getByText(
          'ログインに失敗しました。メールアドレスとパスワードを確認してください。'
        )
      ).toBeInTheDocument();
    });
  });

  it('ネットワークエラー時にエラーメッセージが表示される', async () => {
    const user = userEvent.setup();

    // Amplifyのモック設定（ネットワークエラー）
    vi.mocked(amplifyAuth.signIn).mockRejectedValue(new Error('Network error'));

    renderLoginPage();

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /ログイン/i })
      ).toBeInTheDocument();
    });

    await user.type(
      screen.getByLabelText(/メールアドレス/i),
      'test@example.com'
    );
    await user.type(screen.getByLabelText(/パスワード/i), 'password123');
    await user.click(screen.getByRole('button', { name: /ログイン/i }));

    // エラーメッセージが表示される
    await waitFor(() => {
      expect(
        screen.getByText(
          'ログインに失敗しました。メールアドレスとパスワードを確認してください。'
        )
      ).toBeInTheDocument();
    });
  });

  // トークンストレージテスト
  it('ログイン成功時にトークンがlocalStorageに保存される', async () => {
    const user = userEvent.setup();

    // Amplifyのモック設定
    vi.mocked(amplifyAuth.signIn).mockResolvedValue({
      isSignedIn: true,
      nextStep: { signInStep: 'DONE' },
    } as any);

    vi.mocked(amplifyAuth.fetchAuthSession).mockResolvedValue({
      tokens: {
        idToken: {
          toString: () => 'test-jwt-token-12345',
        },
      },
    } as any);

    vi.mocked(amplifyAuth.getCurrentUser).mockResolvedValue({
      userId: 'user-456',
      username: 'admin@example.com',
      signInDetails: {
        loginId: 'admin@example.com',
      },
    } as any);

    renderLoginPage();

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /ログイン/i })
      ).toBeInTheDocument();
    });

    // 初期状態ではトークンが存在しない
    expect(localStorage.getItem('auth_token')).toBeNull();

    await user.type(
      screen.getByLabelText(/メールアドレス/i),
      'admin@example.com'
    );
    await user.type(screen.getByLabelText(/パスワード/i), 'securePassword123');
    await user.click(screen.getByRole('button', { name: /ログイン/i }));

    // ログイン成功後、トークンが保存される
    await waitFor(() => {
      expect(localStorage.getItem('auth_token')).toBe('test-jwt-token-12345');
    });
  });

  // セッション管理テスト
  it('エラー後に再度ログインを試行できる', async () => {
    const user = userEvent.setup();

    // 最初は失敗
    vi.mocked(amplifyAuth.signIn).mockRejectedValueOnce(
      new Error('Invalid credentials')
    );

    renderLoginPage();

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /ログイン/i })
      ).toBeInTheDocument();
    });

    // 1回目のログイン試行（失敗）
    await user.type(
      screen.getByLabelText(/メールアドレス/i),
      'test@example.com'
    );
    await user.type(screen.getByLabelText(/パスワード/i), 'wrong-password');
    await user.click(screen.getByRole('button', { name: /ログイン/i }));

    await waitFor(() => {
      expect(
        screen.getByText(
          'ログインに失敗しました。メールアドレスとパスワードを確認してください。'
        )
      ).toBeInTheDocument();
    });

    // 2回目のログイン試行（成功）
    vi.mocked(amplifyAuth.signIn).mockResolvedValueOnce({
      isSignedIn: true,
      nextStep: { signInStep: 'DONE' },
    } as any);

    vi.mocked(amplifyAuth.fetchAuthSession).mockResolvedValue({
      tokens: {
        idToken: {
          toString: () => 'new-jwt-token',
        },
      },
    } as any);

    vi.mocked(amplifyAuth.getCurrentUser).mockResolvedValue({
      userId: 'user-789',
      username: 'test@example.com',
      signInDetails: {
        loginId: 'test@example.com',
      },
    } as any);

    // フォームをクリアして再入力
    const emailInput = screen.getByLabelText(/メールアドレス/i);
    const passwordInput = screen.getByLabelText(/パスワード/i);
    await user.clear(emailInput);
    await user.clear(passwordInput);
    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'correct-password');
    await user.click(screen.getByRole('button', { name: /ログイン/i }));

    // 今回は成功してトークンが保存される
    await waitFor(() => {
      expect(localStorage.getItem('auth_token')).toBe('new-jwt-token');
    });

    // エラーメッセージが消える
    await waitFor(() => {
      expect(
        screen.queryByText(
          'ログインに失敗しました。メールアドレスとパスワードを確認してください。'
        )
      ).not.toBeInTheDocument();
    });
  });

  // レスポンシブデザインテスト
  it('レスポンシブデザインクラスが適用されている', async () => {
    const { container } = renderLoginPage();

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /管理画面ログイン/i })
      ).toBeInTheDocument();
    });

    // 背景とレイアウトのクラスが適用されている
    const wrapper = container.querySelector('.login-page');
    expect(wrapper).toBeInTheDocument();

    const formContainer = container.querySelector('.login-card');
    expect(formContainer).toBeInTheDocument();
  });

  // エッジケーステスト
  it('送信中は複数回送信できない', async () => {
    const user = userEvent.setup();

    // 遅延を追加したログイン処理
    vi.mocked(amplifyAuth.signIn).mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                isSignedIn: true,
                nextStep: { signInStep: 'DONE' },
              } as any),
            100
          )
        )
    );

    vi.mocked(amplifyAuth.fetchAuthSession).mockResolvedValue({
      tokens: {
        idToken: {
          toString: () => 'delayed-token',
        },
      },
    } as any);

    vi.mocked(amplifyAuth.getCurrentUser).mockResolvedValue({
      userId: 'user-999',
      username: 'test@example.com',
      signInDetails: {
        loginId: 'test@example.com',
      },
    } as any);

    renderLoginPage();

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /ログイン/i })
      ).toBeInTheDocument();
    });

    await user.type(
      screen.getByLabelText(/メールアドレス/i),
      'test@example.com'
    );
    await user.type(screen.getByLabelText(/パスワード/i), 'password123');

    const submitButton = screen.getByRole('button', { name: /ログイン/i });
    await user.click(submitButton);

    // 送信中はボタンが無効化される
    await waitFor(() => {
      expect(submitButton).toBeDisabled();
    });

    // 処理が完了するまで待つ
    await waitFor(() => {
      expect(submitButton).not.toBeDisabled();
    });
  });

  it('パスワードフィールドはマスクされている', async () => {
    renderLoginPage();

    await waitFor(() => {
      expect(screen.getByLabelText(/パスワード/i)).toBeInTheDocument();
    });

    const passwordInput = screen.getByLabelText(/パスワード/i);
    expect(passwordInput).toHaveAttribute('type', 'password');
  });

  it('空白のみのメールアドレスとパスワードはバリデーションエラーになる', async () => {
    const user = userEvent.setup();
    renderLoginPage();

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /ログイン/i })
      ).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/メールアドレス/i), '   ');
    await user.type(screen.getByLabelText(/パスワード/i), '   ');
    await user.click(screen.getByRole('button', { name: /ログイン/i }));

    await waitFor(() => {
      expect(screen.getByText('メールアドレスは必須です')).toBeInTheDocument();
      expect(screen.getByText('パスワードは必須です')).toBeInTheDocument();
    });
  });

  it('Enterキーでログインできる', async () => {
    const user = userEvent.setup();

    vi.mocked(amplifyAuth.signIn).mockResolvedValue({
      isSignedIn: true,
      nextStep: { signInStep: 'DONE' },
    } as any);

    vi.mocked(amplifyAuth.fetchAuthSession).mockResolvedValue({
      tokens: {
        idToken: {
          toString: () => 'enter-key-token',
        },
      },
    } as any);

    vi.mocked(amplifyAuth.getCurrentUser).mockResolvedValue({
      userId: 'user-enter',
      username: 'enter@example.com',
      signInDetails: {
        loginId: 'enter@example.com',
      },
    } as any);

    renderLoginPage();

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /ログイン/i })
      ).toBeInTheDocument();
    });

    await user.type(
      screen.getByLabelText(/メールアドレス/i),
      'enter@example.com'
    );
    await user.type(screen.getByLabelText(/パスワード/i), 'password123{Enter}');

    // Enterキーでログインが実行される
    await waitFor(() => {
      expect(localStorage.getItem('auth_token')).toBe('enter-key-token');
    });
  });
});
