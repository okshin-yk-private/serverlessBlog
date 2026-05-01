import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminHeader from './AdminHeader';

// Amplifyのモック
vi.mock('aws-amplify/auth', () => ({
  signIn: vi.fn(),
  signOut: vi.fn(),
  getCurrentUser: vi.fn().mockRejectedValue(new Error('Not authenticated')),
  fetchAuthSession: vi.fn(),
  confirmSignIn: vi.fn(),
}));

// useAuthのモック
const mockLogout = vi.fn();
vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'test-user', email: 'test@example.com' },
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: mockLogout,
  }),
}));

const renderAdminHeader = (initialPath = '/dashboard') => {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AdminHeader />
    </MemoryRouter>
  );
};

describe('AdminHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('レンダリング', () => {
    it('ロゴが表示される', () => {
      renderAdminHeader();
      expect(screen.getByAltText('Logo')).toBeInTheDocument();
    });

    it('サイトタイトルが表示される', () => {
      renderAdminHeader();
      expect(screen.getByText('Bone of my fallacy')).toBeInTheDocument();
    });

    it('Adminバッジが表示される', () => {
      renderAdminHeader();
      expect(screen.getByText('Admin')).toBeInTheDocument();
    });

    it('Dashboardリンクが表示される', () => {
      renderAdminHeader();
      expect(
        screen.getByRole('link', { name: 'Dashboard' })
      ).toBeInTheDocument();
    });

    it('Articlesリンクが表示される', () => {
      renderAdminHeader();
      expect(
        screen.getByRole('link', { name: 'Articles' })
      ).toBeInTheDocument();
    });

    it('Categoriesリンクが表示される', () => {
      renderAdminHeader();
      expect(
        screen.getByRole('link', { name: 'Categories' })
      ).toBeInTheDocument();
    });

    it('Mindmapsリンクが表示される', () => {
      renderAdminHeader();
      expect(
        screen.getByRole('link', { name: 'Mindmaps' })
      ).toBeInTheDocument();
    });

    it('+ Newリンクが表示される', () => {
      renderAdminHeader();
      expect(screen.getByRole('link', { name: '+ New' })).toBeInTheDocument();
    });

    it('Logoutボタンが表示される', () => {
      renderAdminHeader();
      expect(
        screen.getByRole('button', { name: 'Logout' })
      ).toBeInTheDocument();
    });
  });

  describe('ナビゲーションリンク', () => {
    it('Dashboardリンクが/dashboardへのリンクを持つ', () => {
      renderAdminHeader();
      const link = screen.getByRole('link', { name: 'Dashboard' });
      expect(link).toHaveAttribute('href', '/dashboard');
    });

    it('Articlesリンクが/postsへのリンクを持つ', () => {
      renderAdminHeader();
      const link = screen.getByRole('link', { name: 'Articles' });
      expect(link).toHaveAttribute('href', '/posts');
    });

    it('Categoriesリンクが/categoriesへのリンクを持つ', () => {
      renderAdminHeader();
      const link = screen.getByRole('link', { name: 'Categories' });
      expect(link).toHaveAttribute('href', '/categories');
    });

    it('Mindmapsリンクが/mindmapsへのリンクを持つ', () => {
      renderAdminHeader();
      const link = screen.getByRole('link', { name: 'Mindmaps' });
      expect(link).toHaveAttribute('href', '/mindmaps');
    });

    it('+ Newリンクが/posts/newへのリンクを持つ', () => {
      renderAdminHeader();
      const link = screen.getByRole('link', { name: '+ New' });
      expect(link).toHaveAttribute('href', '/posts/new');
    });

    it('ロゴが/dashboardへのリンクを持つ', () => {
      renderAdminHeader();
      const logoLink = screen.getByRole('link', {
        name: /Bone of my fallacy/i,
      });
      expect(logoLink).toHaveAttribute('href', '/dashboard');
    });
  });

  describe('アクティブ状態', () => {
    it('現在のパスが/dashboardの場合、Dashboardリンクがactiveクラスを持つ', () => {
      renderAdminHeader('/dashboard');
      const link = screen.getByRole('link', { name: 'Dashboard' });
      expect(link).toHaveClass('active');
    });

    it('現在のパスが/postsの場合、Articlesリンクがactiveクラスを持つ', () => {
      renderAdminHeader('/posts');
      const link = screen.getByRole('link', { name: 'Articles' });
      expect(link).toHaveClass('active');
    });

    it('現在のパスが/posts/1の場合も、Articlesリンクがactiveクラスを持つ', () => {
      renderAdminHeader('/posts/1');
      const link = screen.getByRole('link', { name: 'Articles' });
      expect(link).toHaveClass('active');
    });

    it('現在のパスが/posts/edit/1の場合も、Articlesリンクがactiveクラスを持つ', () => {
      renderAdminHeader('/posts/edit/1');
      const link = screen.getByRole('link', { name: 'Articles' });
      expect(link).toHaveClass('active');
    });

    it('現在のパスが/categoriesの場合、Categoriesリンクがactiveクラスを持つ', () => {
      renderAdminHeader('/categories');
      const link = screen.getByRole('link', { name: 'Categories' });
      expect(link).toHaveClass('active');
    });

    it('現在のパスが/categories/newの場合も、Categoriesリンクがactiveクラスを持つ', () => {
      renderAdminHeader('/categories/new');
      const link = screen.getByRole('link', { name: 'Categories' });
      expect(link).toHaveClass('active');
    });

    it('現在のパスが/categories/edit/1の場合も、Categoriesリンクがactiveクラスを持つ', () => {
      renderAdminHeader('/categories/edit/1');
      const link = screen.getByRole('link', { name: 'Categories' });
      expect(link).toHaveClass('active');
    });

    it('現在のパスが/mindmapsの場合、Mindmapsリンクがactiveクラスを持つ', () => {
      renderAdminHeader('/mindmaps');
      const link = screen.getByRole('link', { name: 'Mindmaps' });
      expect(link).toHaveClass('active');
    });

    it('現在のパスが/mindmaps/newの場合も、Mindmapsリンクがactiveクラスを持つ', () => {
      renderAdminHeader('/mindmaps/new');
      const link = screen.getByRole('link', { name: 'Mindmaps' });
      expect(link).toHaveClass('active');
    });

    it('現在のパスが/mindmaps/edit/1の場合も、Mindmapsリンクがactiveクラスを持つ', () => {
      renderAdminHeader('/mindmaps/edit/1');
      const link = screen.getByRole('link', { name: 'Mindmaps' });
      expect(link).toHaveClass('active');
    });
  });

  describe('ログアウト機能', () => {
    it('Logoutボタンをクリックするとlogout関数が呼ばれる', async () => {
      renderAdminHeader();
      const logoutButton = screen.getByRole('button', { name: 'Logout' });

      fireEvent.click(logoutButton);

      await waitFor(() => {
        expect(mockLogout).toHaveBeenCalled();
      });
    });
  });
});
