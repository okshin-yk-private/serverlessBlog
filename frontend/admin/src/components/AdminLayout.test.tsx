import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminLayout from './AdminLayout';

// Amplifyのモック
vi.mock('aws-amplify/auth', () => ({
  signIn: vi.fn(),
  signOut: vi.fn(),
  getCurrentUser: vi.fn().mockRejectedValue(new Error('Not authenticated')),
  fetchAuthSession: vi.fn(),
  confirmSignIn: vi.fn(),
}));

// useAuthのモック
vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'test-user', email: 'test@example.com' },
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
  }),
}));

const renderAdminLayout = (props: {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) => {
  return render(
    <MemoryRouter>
      <AdminLayout {...props}>
        {props.children || <div>Content</div>}
      </AdminLayout>
    </MemoryRouter>
  );
};

describe('AdminLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('レンダリング', () => {
    it('子要素がレンダリングされる', () => {
      renderAdminLayout({
        children: <div data-testid="child">Child Content</div>,
      });
      expect(screen.getByTestId('child')).toBeInTheDocument();
      expect(screen.getByText('Child Content')).toBeInTheDocument();
    });

    it('AdminHeaderがレンダリングされる', () => {
      renderAdminLayout({});
      // AdminHeaderの要素が存在することを確認
      expect(
        screen.getByRole('link', { name: 'Dashboard' })
      ).toBeInTheDocument();
    });
  });

  describe('タイトルとサブタイトル', () => {
    it('titleが指定された場合、h1要素としてレンダリングされる', () => {
      renderAdminLayout({ title: 'Test Title' });
      expect(
        screen.getByRole('heading', { level: 1, name: 'Test Title' })
      ).toBeInTheDocument();
    });

    it('subtitleが指定された場合、表示される', () => {
      renderAdminLayout({ title: 'Title', subtitle: 'Test Subtitle' });
      expect(screen.getByText('Test Subtitle')).toBeInTheDocument();
    });

    it('titleとsubtitleの両方が指定された場合、両方表示される', () => {
      renderAdminLayout({ title: 'Main Title', subtitle: 'Sub Title' });
      expect(
        screen.getByRole('heading', { level: 1, name: 'Main Title' })
      ).toBeInTheDocument();
      expect(screen.getByText('Sub Title')).toBeInTheDocument();
    });

    it('titleが指定されない場合、heroセクションは表示されない', () => {
      const { container } = renderAdminLayout({});
      expect(container.querySelector('.admin-hero')).not.toBeInTheDocument();
    });

    it('subtitleのみ指定された場合でもheroセクションが表示される', () => {
      const { container } = renderAdminLayout({ subtitle: 'Only Subtitle' });
      expect(container.querySelector('.admin-hero')).toBeInTheDocument();
      expect(screen.getByText('Only Subtitle')).toBeInTheDocument();
    });
  });

  describe('アクション', () => {
    it('actionsが指定された場合、レンダリングされる', () => {
      renderAdminLayout({
        title: 'Title',
        actions: <button data-testid="action-btn">Action</button>,
      });
      expect(screen.getByTestId('action-btn')).toBeInTheDocument();
    });

    it('複数のactionsがレンダリングされる', () => {
      renderAdminLayout({
        title: 'Title',
        actions: (
          <>
            <button data-testid="action1">Action 1</button>
            <button data-testid="action2">Action 2</button>
          </>
        ),
      });
      expect(screen.getByTestId('action1')).toBeInTheDocument();
      expect(screen.getByTestId('action2')).toBeInTheDocument();
    });

    it('actionsがない場合、admin-hero-actionsセクションは表示されない', () => {
      const { container } = renderAdminLayout({ title: 'Title' });
      expect(
        container.querySelector('.admin-hero-actions')
      ).not.toBeInTheDocument();
    });
  });

  describe('レイアウト構造', () => {
    it('admin-pageクラスを持つコンテナがある', () => {
      const { container } = renderAdminLayout({});
      expect(container.querySelector('.admin-page')).toBeInTheDocument();
    });

    it('admin-mainクラスを持つメインセクションがある', () => {
      const { container } = renderAdminLayout({});
      expect(container.querySelector('.admin-main')).toBeInTheDocument();
    });

    it('admin-containerクラスを持つコンテナがある', () => {
      const { container } = renderAdminLayout({});
      expect(container.querySelector('.admin-container')).toBeInTheDocument();
    });
  });
});
