import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { AuthGuard } from './AuthGuard';

// モックのuseAuth
const mockUseAuth = vi.fn();

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

describe('AuthGuard', () => {
  it('認証済みの場合は子要素を表示する', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      user: { id: 'user-123', email: 'test@example.com' },
    });

    render(
      <BrowserRouter>
        <AuthGuard>
          <div>Protected Content</div>
        </AuthGuard>
      </BrowserRouter>
    );

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('未認証の場合はログインページにリダイレクトする', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      user: null,
    });

    render(
      <BrowserRouter>
        <AuthGuard>
          <div>Protected Content</div>
        </AuthGuard>
      </BrowserRouter>
    );

    // Protected Contentは表示されない
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('認証確認中はローディング状態を表示する', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: true,
      user: null,
    });

    render(
      <BrowserRouter>
        <AuthGuard>
          <div>Protected Content</div>
        </AuthGuard>
      </BrowserRouter>
    );

    expect(screen.getByText(/読み込み中/i)).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('カスタムローディングメッセージを表示できる', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: true,
      user: null,
    });

    render(
      <BrowserRouter>
        <AuthGuard loadingMessage="認証を確認しています...">
          <div>Protected Content</div>
        </AuthGuard>
      </BrowserRouter>
    );

    expect(screen.getByText('認証を確認しています...')).toBeInTheDocument();
  });

  it('複数の子要素を正しく表示する', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      user: { id: 'user-123', email: 'test@example.com' },
    });

    render(
      <BrowserRouter>
        <AuthGuard>
          <div>First Element</div>
          <div>Second Element</div>
        </AuthGuard>
      </BrowserRouter>
    );

    expect(screen.getByText('First Element')).toBeInTheDocument();
    expect(screen.getByText('Second Element')).toBeInTheDocument();
  });

  it('ユーザー情報が存在する場合のみ認証済みとみなす', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      user: null, // userがnullの場合
    });

    render(
      <BrowserRouter>
        <AuthGuard>
          <div>Protected Content</div>
        </AuthGuard>
      </BrowserRouter>
    );

    // userがnullの場合はリダイレクトされる
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });
});
