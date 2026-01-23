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
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import PostListPage from './PostListPage';
import type { Post, PostListResponse, CategoryListItem } from '../types/post';

// モックカテゴリーデータ
const mockCategories: CategoryListItem[] = [
  { id: 'cat-1', name: 'Technology', slug: 'technology', sortOrder: 1 },
  { id: 'cat-2', name: 'Life', slug: 'life', sortOrder: 2 },
];

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

// APIモックのヘルパー関数（/posts と /categories 両方をモック）
const setupApiMocks = async (
  postsResponses: PostListResponse | PostListResponse[],
  categoriesResponse: CategoryListItem[] = mockCategories
) => {
  const axios = await import('axios');
  const postsQueue = Array.isArray(postsResponses)
    ? [...postsResponses]
    : [postsResponses];
  let postsCallIndex = 0;

  vi.mocked(axios.default.get).mockImplementation((url: string) => {
    if (url.includes('/categories')) {
      return Promise.resolve({ data: categoriesResponse });
    }
    // /postsへのリクエスト
    const response =
      postsQueue[postsCallIndex] || postsQueue[postsQueue.length - 1];
    postsCallIndex++;
    return Promise.resolve({ data: response });
  });
  return axios;
};

describe('PostListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('記事一覧レンダリング', () => {
    it('公開記事の一覧を表示する', async () => {
      // Arrange
      await setupApiMocks({
        items: mockPosts,
        count: mockPosts.length,
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
      await setupApiMocks({
        items: [],
        count: 0,
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
        () => new Promise(() => {}) // 永遠に解決しないPromise
      );

      // Act
      renderWithRouter(<PostListPage />);

      // Assert - スケルトンUIはaria-label="Loading"を持つ
      expect(screen.getByLabelText('Loading')).toBeInTheDocument();
    });

    it('エラー時は「エラーが発生しました」と表示する', async () => {
      // Arrange
      const axios = await import('axios');
      vi.mocked(axios.default.get).mockImplementation((url: string) => {
        if (url.includes('/categories')) {
          return Promise.resolve({ data: mockCategories });
        }
        return Promise.reject(new Error('Network Error'));
      });

      // Act
      renderWithRouter(<PostListPage />);

      // Assert
      await waitFor(() => {
        expect(screen.getByText(/エラーが発生しました/)).toBeInTheDocument();
      });
    });

    it('response.itemsがundefinedの場合は空の記事リストを表示する', async () => {
      // Arrange
      await setupApiMocks({
        count: 0,
      } as any);

      // Act
      renderWithRouter(<PostListPage />);

      // Assert
      await waitFor(() => {
        expect(screen.getByText('記事がありません')).toBeInTheDocument();
      });
    });

    it('各記事にタイトル、カテゴリ、作成日時が表示される', async () => {
      // Arrange
      await setupApiMocks({
        items: [mockPosts[0]],
        count: 1,
      });

      // Act
      renderWithRouter(<PostListPage />);

      // Assert
      await waitFor(() => {
        expect(screen.getByText('テスト記事1')).toBeInTheDocument();

        // カテゴリは記事カード内のspan要素で確認
        const categorySpans = screen.getAllByText(/technology/i);
        const categoryInCard = categorySpans.find(
          (el) => el.className === 'category'
        );
        expect(categoryInCard).toBeInTheDocument();

        expect(screen.getByText(/2025\/1\/15/)).toBeInTheDocument();
      });
    });
  });

  describe('ページネーションコントロール', () => {
    it('nextTokenがある場合は「次へ」ボタンを表示する', async () => {
      // Arrange
      await setupApiMocks({
        items: mockPosts,
        count: mockPosts.length,
        nextToken: 'token-123',
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
      await setupApiMocks({
        items: mockPosts,
        count: mockPosts.length,
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
      const axios = await setupApiMocks([
        { items: mockPosts.slice(0, 2), count: 2, nextToken: 'token-123' },
        { items: [mockPosts[2]], count: 1 },
      ]);

      renderWithRouter(<PostListPage />);

      await waitFor(() => {
        expect(screen.getByText('テスト記事1')).toBeInTheDocument();
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
        })
      );
    });

    it('最初のページでは「前へ」ボタンを無効化する', async () => {
      // Arrange
      await setupApiMocks({
        items: mockPosts,
        count: mockPosts.length,
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
      await setupApiMocks([
        { items: mockPosts.slice(0, 2), count: 2, nextToken: 'token-123' },
        { items: [mockPosts[2]], count: 1 },
        { items: mockPosts.slice(0, 2), count: 2, nextToken: 'token-123' },
      ]);

      renderWithRouter(<PostListPage />);

      await waitFor(() => {
        expect(screen.getByText('テスト記事1')).toBeInTheDocument();
      });

      // 次のページに移動
      const nextButton = screen.getByRole('button', { name: /次へ/i });
      await user.click(nextButton);

      await waitFor(() => {
        expect(screen.getByText('テスト記事3')).toBeInTheDocument();
      });

      // Act - 最初のページに戻る
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
      await setupApiMocks({
        items: mockPosts,
        count: mockPosts.length,
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
      const axios = await setupApiMocks([
        { items: mockPosts, count: mockPosts.length },
        {
          items: mockPosts.filter((p) => p.category === 'technology'),
          count: 2,
        },
      ]);

      renderWithRouter(<PostListPage />);

      await waitFor(() => {
        expect(screen.getByText('テスト記事1')).toBeInTheDocument();
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
        })
      );
    });

    it('「すべて」を選択するとフィルタを解除する', async () => {
      // Arrange
      const user = userEvent.setup();
      const axios = await setupApiMocks({
        items: mockPosts,
        count: mockPosts.length,
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
          })
        );
      });
    });

    it('カテゴリピルボタン（Technology）をクリックするとフィルタされる', async () => {
      // Arrange
      const user = userEvent.setup();
      const axios = await setupApiMocks([
        { items: mockPosts, count: mockPosts.length },
        {
          items: mockPosts.filter((p) => p.category === 'technology'),
          count: 2,
        },
      ]);

      renderWithRouter(<PostListPage />);

      await waitFor(() => {
        expect(screen.getByText('テスト記事1')).toBeInTheDocument();
      });

      // Act - Technologyピルボタンをクリック
      const technologyButton = screen.getByRole('button', {
        name: /Technology/i,
      });
      await user.click(technologyButton);

      // Assert
      await waitFor(() => {
        expect(axios.default.get).toHaveBeenLastCalledWith(
          expect.any(String),
          expect.objectContaining({
            params: expect.objectContaining({
              category: 'technology',
            }),
          })
        );
      });
    });

    it('カテゴリピルボタン（Life）をクリックするとフィルタされる', async () => {
      // Arrange
      const user = userEvent.setup();
      const axios = await setupApiMocks([
        { items: mockPosts, count: mockPosts.length },
        { items: mockPosts.filter((p) => p.category === 'life'), count: 1 },
      ]);

      renderWithRouter(<PostListPage />);

      await waitFor(() => {
        expect(screen.getByText('テスト記事1')).toBeInTheDocument();
      });

      // Act - Lifeピルボタンをクリック
      const lifeButton = screen.getByRole('button', { name: /Life/i });
      await user.click(lifeButton);

      // Assert
      await waitFor(() => {
        expect(axios.default.get).toHaveBeenLastCalledWith(
          expect.any(String),
          expect.objectContaining({
            params: expect.objectContaining({
              category: 'life',
            }),
          })
        );
      });
    });

    it('カテゴリピルボタン（All）をクリックするとフィルタが解除される', async () => {
      // Arrange
      const user = userEvent.setup();
      const axios = await setupApiMocks({
        items: mockPosts,
        count: mockPosts.length,
      });

      renderWithRouter(<PostListPage />);

      await waitFor(() => {
        expect(screen.getByText('テスト記事1')).toBeInTheDocument();
      });

      // まずTechnologyを選択
      const technologyButton = screen.getByRole('button', {
        name: /Technology/i,
      });
      await user.click(technologyButton);

      await waitFor(() => {
        expect(axios.default.get).toHaveBeenCalled();
      });

      // Act - Allピルボタンをクリック
      const allButton = screen.getByRole('button', { name: /All/i });
      await user.click(allButton);

      // Assert
      await waitFor(() => {
        expect(axios.default.get).toHaveBeenLastCalledWith(
          expect.any(String),
          expect.objectContaining({
            params: expect.not.objectContaining({
              category: expect.anything(),
            }),
          })
        );
      });
    });
  });

  describe('タグフィルタ機能', () => {
    it('タグフィルタのUIを表示する', async () => {
      // Arrange
      await setupApiMocks({
        items: mockPosts,
        count: mockPosts.length,
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
      const axios = await setupApiMocks([
        { items: mockPosts, count: mockPosts.length },
        { items: mockPosts.filter((p) => p.tags.includes('react')), count: 1 },
      ]);

      renderWithRouter(<PostListPage />);

      await waitFor(() => {
        expect(screen.getByText('テスト記事1')).toBeInTheDocument();
      });

      // Act
      const tagInput = screen.getByLabelText(/タグ/i);
      await user.type(tagInput, 'react');
      await user.keyboard('{Enter}');

      // Assert
      await waitFor(() => {
        expect(screen.getByText('テスト記事1')).toBeInTheDocument();
        expect(screen.queryByText('テスト記事2')).not.toBeInTheDocument();
        expect(screen.queryByText('テスト記事3')).not.toBeInTheDocument();
      });

      // qパラメータを含むAPIリクエストが送信されたことを確認（tags → q に変換される）
      expect(axios.default.get).toHaveBeenLastCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: expect.objectContaining({
            q: 'react',
          }),
        })
      );
    });

    it('空のタグで検索すると全記事を表示する', async () => {
      // Arrange
      const user = userEvent.setup();
      const axios = await setupApiMocks({
        items: mockPosts,
        count: mockPosts.length,
      });

      renderWithRouter(<PostListPage />);

      await waitFor(() => {
        expect(screen.getByLabelText(/タグ/i)).toBeInTheDocument();
      });

      // Act - 空のタグで検索（Enterキーを押す）
      const tagInput = screen.getByLabelText(/タグ/i);
      await user.click(tagInput);
      await user.keyboard('{Enter}');

      // Assert - qパラメータが含まれないことを確認
      await waitFor(() => {
        const calls = vi.mocked(axios.default.get).mock.calls;
        const lastCall = calls[calls.length - 1];
        expect(lastCall[1]?.params).toBeDefined();
        expect(lastCall[1]?.params.q).toBeUndefined();
      });
    });

    it('カテゴリとタグを組み合わせてフィルタできる', async () => {
      // Arrange
      const user = userEvent.setup();
      const axios = await setupApiMocks({
        items: mockPosts,
        count: mockPosts.length,
      });

      renderWithRouter(<PostListPage />);

      await waitFor(() => {
        expect(screen.getByText('テスト記事1')).toBeInTheDocument();
      });

      // Act
      const categorySelect = screen.getByLabelText(/カテゴリ/i);
      await user.selectOptions(categorySelect, 'technology');

      const tagInput = screen.getByLabelText(/タグ/i);
      await user.type(tagInput, 'react');
      await user.keyboard('{Enter}');

      // Assert
      await waitFor(() => {
        expect(axios.default.get).toHaveBeenLastCalledWith(
          expect.any(String),
          expect.objectContaining({
            params: expect.objectContaining({
              category: 'technology',
              q: 'react',
            }),
          })
        );
      });
    });
  });

  describe('レスポンシブデザイン動作', () => {
    it('記事一覧コンテナが存在する', async () => {
      // Arrange
      await setupApiMocks({
        items: mockPosts,
        count: mockPosts.length,
      });

      // Act
      renderWithRouter(<PostListPage />);

      // Assert
      await waitFor(() => {
        const container = screen.getByTestId('article-list');
        expect(container).toBeInTheDocument();
        expect(container.className).toContain('post-list-container');
      });
    });

    it('複数の記事カードがレンダリングされる', async () => {
      // Arrange
      await setupApiMocks({
        items: mockPosts,
        count: mockPosts.length,
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

    it('contentHtmlが空の記事でも正しく表示される', async () => {
      // Arrange
      const postsWithEmptyContent = [
        {
          ...mockPosts[0],
          contentHtml: '',
        },
      ];
      await setupApiMocks({
        items: postsWithEmptyContent,
        count: postsWithEmptyContent.length,
      });

      // Act
      renderWithRouter(<PostListPage />);

      // Assert
      await waitFor(() => {
        const articles = screen.getAllByRole('article');
        expect(articles).toHaveLength(1);
        // excerptが空文字列になることを確認
        const excerpt = screen.getByTestId('article-excerpt');
        expect(excerpt.textContent).toBe('');
      });
    });
  });

  describe('カテゴリ動的取得', () => {
    it('APIから取得したカテゴリがピルボタンとして表示される', async () => {
      // Arrange
      await setupApiMocks({
        items: mockPosts,
        count: mockPosts.length,
      });

      // Act
      renderWithRouter(<PostListPage />);

      // Assert - 動的に取得したカテゴリが表示される
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
        expect(
          screen.getByRole('button', { name: 'Technology' })
        ).toBeInTheDocument();
        expect(
          screen.getByRole('button', { name: 'Life' })
        ).toBeInTheDocument();
      });
    });

    it('カテゴリがない場合はAllボタンのみ表示される', async () => {
      // Arrange
      await setupApiMocks(
        { items: mockPosts, count: mockPosts.length },
        [] // カテゴリなし
      );

      // Act
      renderWithRouter(<PostListPage />);

      // Assert
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
        // カテゴリボタンは存在しない（Allのみ）
        const buttons = screen.getAllByRole('button');
        const categoryPills = buttons.filter((btn) =>
          btn.className.includes('category-pill')
        );
        expect(categoryPills).toHaveLength(1); // Allのみ
      });
    });
  });
});
