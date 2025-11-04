/**
 * PostListPage Component Tests
 *
 * Task 5.1: 記事一覧ページの実装（TDD）
 * Requirements: R33 (公開サイト), R39 (TDD), R41 (フロントエンドカバレッジ100%)
 *
 * Test Coverage:
 * - 記事一覧レンダリング
 * - ページネーションコントロール
 * - カテゴリフィルタ機能
 * - レスポンシブデザイン動作
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import PostListPage from './PostListPage';
import type { Post, PostListResponse } from '../types/post';

// モックデータ
const mockPosts: Post[] = [
  {
    id: 'post-1',
    title: 'テスト記事1',
    contentHtml: '<p>テスト本文1</p>',
    category: 'technology',
    tags: ['react', 'typescript'],
    publishStatus: 'published',
    authorId: 'author-1',
    createdAt: '2025-01-15T10:00:00Z',
    updatedAt: '2025-01-15T10:00:00Z',
    publishedAt: '2025-01-15T10:00:00Z',
  },
  {
    id: 'post-2',
    title: 'テスト記事2',
    contentHtml: '<p>テスト本文2</p>',
    category: 'life',
    tags: ['blog'],
    publishStatus: 'published',
    authorId: 'author-1',
    createdAt: '2025-01-14T10:00:00Z',
    updatedAt: '2025-01-14T10:00:00Z',
    publishedAt: '2025-01-14T10:00:00Z',
  },
  {
    id: 'post-3',
    title: 'テスト記事3',
    contentHtml: '<p>テスト本文3</p>',
    category: 'technology',
    tags: ['aws'],
    publishStatus: 'published',
    authorId: 'author-2',
    createdAt: '2025-01-13T10:00:00Z',
    updatedAt: '2025-01-13T10:00:00Z',
    publishedAt: '2025-01-13T10:00:00Z',
  },
];

// axiosのモック
vi.mock('axios');

const renderWithRouter = (component: React.ReactElement) => {
  return render(<BrowserRouter>{component}</BrowserRouter>);
};

describe('PostListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('記事一覧レンダリング', () => {
    it('公開記事の一覧を表示する', async () => {
      // Arrange
      const axios = await import('axios');
      vi.mocked(axios.default.get).mockResolvedValueOnce({
        data: {
          items: mockPosts,
          count: mockPosts.length,
        } as PostListResponse,
      });

      // Act
      renderWithRouter(<PostListPage />);

      // Assert
      await waitFor(() => {
        expect(screen.getByText('テスト記事1')).toBeInTheDocument();
        expect(screen.getByText('テスト記事2')).toBeInTheDocument();
        expect(screen.getByText('テスト記事3')).toBeInTheDocument();
      });
    });

    it('記事がない場合は「記事がありません」と表示する', async () => {
      // Arrange
      const axios = await import('axios');
      vi.mocked(axios.default.get).mockResolvedValueOnce({
        data: {
          items: [],
          count: 0,
        } as PostListResponse,
      });

      // Act
      renderWithRouter(<PostListPage />);

      // Assert
      await waitFor(() => {
        expect(screen.getByText(/記事がありません/)).toBeInTheDocument();
      });
    });

    it('ローディング中は「読み込み中...」と表示する', async () => {
      // Arrange
      const axios = await import('axios');
      vi.mocked(axios.default.get).mockImplementation(
        () => new Promise(() => {}), // 永遠に解決しないPromise
      );

      // Act
      renderWithRouter(<PostListPage />);

      // Assert
      expect(screen.getByText(/読み込み中/)).toBeInTheDocument();
    });

    it('エラー時は「エラーが発生しました」と表示する', async () => {
      // Arrange
      const axios = await import('axios');
      vi.mocked(axios.default.get).mockRejectedValueOnce(
        new Error('Network Error'),
      );

      // Act
      renderWithRouter(<PostListPage />);

      // Assert
      await waitFor(() => {
        expect(screen.getByText(/エラーが発生しました/)).toBeInTheDocument();
      });
    });

    it('各記事にタイトル、カテゴリ、作成日時が表示される', async () => {
      // Arrange
      const axios = await import('axios');
      vi.mocked(axios.default.get).mockResolvedValueOnce({
        data: {
          items: [mockPosts[0]],
          count: 1,
        } as PostListResponse,
      });

      // Act
      renderWithRouter(<PostListPage />);

      // Assert
      await waitFor(() => {
        expect(screen.getByText('テスト記事1')).toBeInTheDocument();

        // カテゴリは記事カード内のspan要素で確認
        const categorySpans = screen.getAllByText(/technology/i);
        const categoryInCard = categorySpans.find(
          (el) => el.className === 'category',
        );
        expect(categoryInCard).toBeInTheDocument();

        expect(screen.getByText(/2025\/1\/15/)).toBeInTheDocument();
      });
    });
  });

  describe('ページネーションコントロール', () => {
    it('nextTokenがある場合は「次へ」ボタンを表示する', async () => {
      // Arrange
      const axios = await import('axios');
      vi.mocked(axios.default.get).mockResolvedValueOnce({
        data: {
          items: mockPosts,
          count: mockPosts.length,
          nextToken: 'token-123',
        } as PostListResponse,
      });

      // Act
      renderWithRouter(<PostListPage />);

      // Assert
      await waitFor(() => {
        const nextButton = screen.getByRole('button', { name: /次へ/i });
        expect(nextButton).toBeInTheDocument();
        expect(nextButton).toBeEnabled();
      });
    });

    it('nextTokenがない場合は「次へ」ボタンを無効化する', async () => {
      // Arrange
      const axios = await import('axios');
      vi.mocked(axios.default.get).mockResolvedValueOnce({
        data: {
          items: mockPosts,
          count: mockPosts.length,
        } as PostListResponse,
      });

      // Act
      renderWithRouter(<PostListPage />);

      // Assert
      await waitFor(() => {
        const nextButton = screen.getByRole('button', { name: /次へ/i });
        expect(nextButton).toBeDisabled();
      });
    });

    it('「次へ」ボタンをクリックすると次のページを読み込む', async () => {
      // Arrange
      const user = userEvent.setup();
      const axios = await import('axios');

      // 最初のページ
      vi.mocked(axios.default.get).mockResolvedValueOnce({
        data: {
          items: mockPosts.slice(0, 2),
          count: 2,
          nextToken: 'token-123',
        } as PostListResponse,
      });

      renderWithRouter(<PostListPage />);

      await waitFor(() => {
        expect(screen.getByText('テスト記事1')).toBeInTheDocument();
      });

      // 2ページ目のモック
      vi.mocked(axios.default.get).mockResolvedValueOnce({
        data: {
          items: [mockPosts[2]],
          count: 1,
        } as PostListResponse,
      });

      // Act
      const nextButton = screen.getByRole('button', { name: /次へ/i });
      await user.click(nextButton);

      // Assert
      await waitFor(() => {
        expect(screen.getByText('テスト記事3')).toBeInTheDocument();
      });

      // nextTokenを含むAPIリクエストが送信されたことを確認
      expect(axios.default.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: expect.objectContaining({
            nextToken: 'token-123',
          }),
        }),
      );
    });

    it('最初のページでは「前へ」ボタンを無効化する', async () => {
      // Arrange
      const axios = await import('axios');
      vi.mocked(axios.default.get).mockResolvedValueOnce({
        data: {
          items: mockPosts,
          count: mockPosts.length,
        } as PostListResponse,
      });

      // Act
      renderWithRouter(<PostListPage />);

      // Assert
      await waitFor(() => {
        const prevButton = screen.getByRole('button', { name: /前へ/i });
        expect(prevButton).toBeDisabled();
      });
    });

    it('次のページに移動した後、「前へ」ボタンで最初のページに戻る', async () => {
      // Arrange
      const user = userEvent.setup();
      const axios = await import('axios');

      // 最初のページ
      vi.mocked(axios.default.get).mockResolvedValueOnce({
        data: {
          items: mockPosts.slice(0, 2),
          count: 2,
          nextToken: 'token-123',
        } as PostListResponse,
      });

      renderWithRouter(<PostListPage />);

      await waitFor(() => {
        expect(screen.getByText('テスト記事1')).toBeInTheDocument();
      });

      // 次のページに移動
      vi.mocked(axios.default.get).mockResolvedValueOnce({
        data: {
          items: [mockPosts[2]],
          count: 1,
        } as PostListResponse,
      });

      const nextButton = screen.getByRole('button', { name: /次へ/i });
      await user.click(nextButton);

      await waitFor(() => {
        expect(screen.getByText('テスト記事3')).toBeInTheDocument();
      });

      // 最初のページに戻る
      vi.mocked(axios.default.get).mockResolvedValueOnce({
        data: {
          items: mockPosts.slice(0, 2),
          count: 2,
          nextToken: 'token-123',
        } as PostListResponse,
      });

      // Act
      const prevButton = screen.getByRole('button', { name: /前へ/i });
      await user.click(prevButton);

      // Assert
      await waitFor(() => {
        expect(screen.getByText('テスト記事1')).toBeInTheDocument();
      });
    });
  });

  describe('カテゴリフィルタ機能', () => {
    it('カテゴリフィルタのドロップダウンを表示する', async () => {
      // Arrange
      const axios = await import('axios');
      vi.mocked(axios.default.get).mockResolvedValueOnce({
        data: {
          items: mockPosts,
          count: mockPosts.length,
        } as PostListResponse,
      });

      // Act
      renderWithRouter(<PostListPage />);

      // Assert
      await waitFor(() => {
        expect(screen.getByLabelText(/カテゴリ/i)).toBeInTheDocument();
      });
    });

    it('カテゴリを選択すると該当カテゴリの記事のみを表示する', async () => {
      // Arrange
      const user = userEvent.setup();
      const axios = await import('axios');

      // 最初は全記事
      vi.mocked(axios.default.get).mockResolvedValueOnce({
        data: {
          items: mockPosts,
          count: mockPosts.length,
        } as PostListResponse,
      });

      renderWithRouter(<PostListPage />);

      await waitFor(() => {
        expect(screen.getByText('テスト記事1')).toBeInTheDocument();
      });

      // technologyカテゴリでフィルタ
      vi.mocked(axios.default.get).mockResolvedValueOnce({
        data: {
          items: mockPosts.filter((p) => p.category === 'technology'),
          count: 2,
        } as PostListResponse,
      });

      // Act
      const categorySelect = screen.getByLabelText(/カテゴリ/i);
      await user.selectOptions(categorySelect, 'technology');

      // Assert
      await waitFor(() => {
        expect(screen.getByText('テスト記事1')).toBeInTheDocument();
        expect(screen.getByText('テスト記事3')).toBeInTheDocument();
        expect(screen.queryByText('テスト記事2')).not.toBeInTheDocument();
      });

      // categoryパラメータを含むAPIリクエストが送信されたことを確認
      expect(axios.default.get).toHaveBeenLastCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: expect.objectContaining({
            category: 'technology',
          }),
        }),
      );
    });

    it('「すべて」を選択するとフィルタを解除する', async () => {
      // Arrange
      const user = userEvent.setup();
      const axios = await import('axios');

      vi.mocked(axios.default.get).mockResolvedValue({
        data: {
          items: mockPosts,
          count: mockPosts.length,
        } as PostListResponse,
      });

      renderWithRouter(<PostListPage />);

      await waitFor(() => {
        expect(screen.getByText('テスト記事1')).toBeInTheDocument();
      });

      // Act
      const categorySelect = screen.getByLabelText(/カテゴリ/i);
      await user.selectOptions(categorySelect, '');

      // Assert
      await waitFor(() => {
        expect(axios.default.get).toHaveBeenLastCalledWith(
          expect.any(String),
          expect.objectContaining({
            params: expect.not.objectContaining({
              category: expect.anything(),
            }),
          }),
        );
      });
    });
  });

  describe('タグフィルタ機能', () => {
    it('タグフィルタのUIを表示する', async () => {
      // Arrange
      const axios = await import('axios');
      vi.mocked(axios.default.get).mockResolvedValueOnce({
        data: {
          items: mockPosts,
          count: mockPosts.length,
        } as PostListResponse,
      });

      // Act
      renderWithRouter(<PostListPage />);

      // Assert
      await waitFor(() => {
        expect(screen.getByLabelText(/タグ/i)).toBeInTheDocument();
      });
    });

    it('タグを入力して検索すると該当タグの記事のみを表示する', async () => {
      // Arrange
      const user = userEvent.setup();
      const axios = await import('axios');

      // 最初は全記事
      vi.mocked(axios.default.get).mockResolvedValueOnce({
        data: {
          items: mockPosts,
          count: mockPosts.length,
        } as PostListResponse,
      });

      renderWithRouter(<PostListPage />);

      await waitFor(() => {
        expect(screen.getByText('テスト記事1')).toBeInTheDocument();
      });

      // reactタグでフィルタ
      vi.mocked(axios.default.get).mockResolvedValueOnce({
        data: {
          items: mockPosts.filter((p) => p.tags.includes('react')),
          count: 1,
        } as PostListResponse,
      });

      // Act
      const tagInput = screen.getByLabelText(/タグ/i);
      await user.type(tagInput, 'react');

      const searchButton = screen.getByRole('button', { name: /検索/i });
      await user.click(searchButton);

      // Assert
      await waitFor(() => {
        expect(screen.getByText('テスト記事1')).toBeInTheDocument();
        expect(screen.queryByText('テスト記事2')).not.toBeInTheDocument();
        expect(screen.queryByText('テスト記事3')).not.toBeInTheDocument();
      });

      // tagsパラメータを含むAPIリクエストが送信されたことを確認
      expect(axios.default.get).toHaveBeenLastCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: expect.objectContaining({
            tags: 'react',
          }),
        }),
      );
    });

    it('空のタグで検索すると全記事を表示する', async () => {
      // Arrange
      const user = userEvent.setup();
      const axios = await import('axios');

      // 最初は全記事
      vi.mocked(axios.default.get).mockResolvedValue({
        data: {
          items: mockPosts,
          count: mockPosts.length,
        } as PostListResponse,
      });

      renderWithRouter(<PostListPage />);

      await waitFor(() => {
        expect(screen.getByLabelText(/タグ/i)).toBeInTheDocument();
      });

      const searchButton = screen.getByRole('button', { name: /検索/i });

      // Act - 空のタグで検索
      await user.click(searchButton);

      // Assert - tagsパラメータが含まれないことを確認
      await waitFor(() => {
        const calls = vi.mocked(axios.default.get).mock.calls;
        const lastCall = calls[calls.length - 1];
        expect(lastCall[1]?.params).toBeDefined();
        expect(lastCall[1]?.params.tags).toBeUndefined();
      });
    });

    it('カテゴリとタグを組み合わせてフィルタできる', async () => {
      // Arrange
      const user = userEvent.setup();
      const axios = await import('axios');

      vi.mocked(axios.default.get).mockResolvedValue({
        data: {
          items: mockPosts,
          count: mockPosts.length,
        } as PostListResponse,
      });

      renderWithRouter(<PostListPage />);

      await waitFor(() => {
        expect(screen.getByText('テスト記事1')).toBeInTheDocument();
      });

      // technologyカテゴリとreactタグでフィルタ
      vi.mocked(axios.default.get).mockResolvedValueOnce({
        data: {
          items: mockPosts.filter(
            (p) => p.category === 'technology' && p.tags.includes('react'),
          ),
          count: 1,
        } as PostListResponse,
      });

      // Act
      const categorySelect = screen.getByLabelText(/カテゴリ/i);
      await user.selectOptions(categorySelect, 'technology');

      const tagInput = screen.getByLabelText(/タグ/i);
      await user.type(tagInput, 'react');

      const searchButton = screen.getByRole('button', { name: /検索/i });
      await user.click(searchButton);

      // Assert
      await waitFor(() => {
        expect(axios.default.get).toHaveBeenLastCalledWith(
          expect.any(String),
          expect.objectContaining({
            params: expect.objectContaining({
              category: 'technology',
              tags: 'react',
            }),
          }),
        );
      });
    });
  });

  describe('レスポンシブデザイン動作', () => {
    it('記事一覧コンテナが存在する', async () => {
      // Arrange
      const axios = await import('axios');
      vi.mocked(axios.default.get).mockResolvedValueOnce({
        data: {
          items: mockPosts,
          count: mockPosts.length,
        } as PostListResponse,
      });

      // Act
      renderWithRouter(<PostListPage />);

      // Assert
      await waitFor(() => {
        const container = screen.getByTestId('post-list-container');
        expect(container).toBeInTheDocument();
        expect(container.className).toContain('post-list-container');
      });
    });

    it('複数の記事カードがレンダリングされる', async () => {
      // Arrange
      const axios = await import('axios');
      vi.mocked(axios.default.get).mockResolvedValueOnce({
        data: {
          items: mockPosts,
          count: mockPosts.length,
        } as PostListResponse,
      });

      // Act
      renderWithRouter(<PostListPage />);

      // Assert
      await waitFor(() => {
        const articles = screen.getAllByRole('article');
        expect(articles).toHaveLength(mockPosts.length);

        // 各記事カードがpost-cardクラスを持つ
        articles.forEach((article) => {
          expect(article.className).toContain('post-card');
        });
      });
    });
  });
});
